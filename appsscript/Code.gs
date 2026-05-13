const SERIES_MATCHES_URL = 'https://www.cricbuzz.com/cricket-series/9241/indian-premier-league-2026/matches';
const SHEET_NAME = 'Selections';
const OPEN_SELECTION_STATES = ['upcoming', 'preview', 'toss'];
const MATCH_CACHE_KEY = 'matches_9241';
const MATCH_BACKUP_KEY = 'matches_9241_backup';
const MATCH_CACHE_TTL_SECONDS = 180;

function doGet(e) {
  return handleRequest_(e, 'GET');
}

function doPost(e) {
  return handleRequest_(e, 'POST');
}

function handleRequest_(e, method) {
  try {
    const action = String((e && e.parameter && e.parameter.action) || '').trim().toLowerCase();

    if (action === 'matches') {
      return jsonOutput_({ ok: true, matches: getMatches_() });
    }

    if (action === 'submission') {
      const name = String((e.parameter && e.parameter.name) || '').trim();
      const matchId = String((e.parameter && e.parameter.matchId) || '').trim();
      return jsonOutput_(getSubmission_(name, matchId));
    }

    if (method === 'POST' && action === 'submit') {
      const payload = parseJsonBody_(e);
      return jsonOutput_(submitSelection_(payload));
    }

    if (action === 'transformmatch') {
      const matchId = String((e.parameter && e.parameter.matchId) || '').trim();
      if (!matchId) {
        return jsonOutput_({ error: "matchId parameter is required" });
      }
      return jsonOutput_(getTransformedMatchData(matchId));
    }

    return jsonOutput_({ ok: false, message: 'Unknown action.' });
  } catch (error) {
    return jsonOutput_({ ok: false, message: error.message || 'Unexpected error.' });
  }
}

function parseJsonBody_(e) {
  const raw = (e && e.postData && e.postData.contents) || '{}';
  return JSON.parse(raw);
}

function jsonOutput_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function fetchHtml_(url) {
  return UrlFetchApp.fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    },
    muteHttpExceptions: true
  }).getContentText();
}

function getMatches_() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get(MATCH_CACHE_KEY);
  if (cached) {
    return JSON.parse(cached);
  }

  try {
    const page = fetchHtml_(SERIES_MATCHES_URL);
    if (!page || /Bandwidth quota exceeded/i.test(page)) {
      throw new Error('Cricbuzz bandwidth limit hit while fetching match list.');
    }

    const matches = parseMatchesFromHtml_(page);
    if (!matches.length) {
      throw new Error('No matches could be parsed from Cricbuzz.');
    }

    cache.put(MATCH_CACHE_KEY, JSON.stringify(matches), MATCH_CACHE_TTL_SECONDS);
    PropertiesService.getScriptProperties().setProperty(MATCH_BACKUP_KEY, JSON.stringify(matches));
    return matches;
  } catch (error) {
    const backup = PropertiesService.getScriptProperties().getProperty(MATCH_BACKUP_KEY);
    if (backup) {
      return JSON.parse(backup);
    }
    throw error;
  }
}

function parseMatchesFromHtml_(page) {
  const normalizedPage = page.replace(/\\\"/g, '"').replace(/\\\//g, '/');
  const hrefRegex = /href="(\/live-cricket-scores\/(\d+)\/([^\"]+))"/g;
  const urlByMatchId = {};
  let hrefMatch;

  while ((hrefMatch = hrefRegex.exec(page)) !== null) {
    const matchId = hrefMatch[2];
    const slug = hrefMatch[3].replace(/\/$/, '').trim();
    if (!urlByMatchId[matchId]) {
      urlByMatchId[matchId] = {
        slug: slug,
        scoreUrl: 'https://www.cricbuzz.com/live-cricket-scores/' + matchId + '/' + slug,
        scorecardUrl: 'https://www.cricbuzz.com/live-cricket-scorecard/' + matchId + '/' + slug
      };
    }
  }

  const blockRegex = /"matchDetailsMap":\{"key":"[^"]+","match":\[(.*?)\],"seriesId":9241\}/gs;
  const matchRegex = /"matchInfo":\{.*?"matchId":(\d+).*?"seriesId":9241.*?"seriesName":"(?:Indian Premier League 2026|IPL 2026)".*?"matchDesc":"([^"]+)".*?"state":"([^"]+)".*?"status":"([^"]*)".*?"team1":\{.*?"teamName":"([^"]+)".*?"team2":\{.*?"teamName":"([^"]+)"/gs;

  const matches = [];
  const seen = {};
  let blockMatch;

  while ((blockMatch = blockRegex.exec(normalizedPage)) !== null) {
    const block = blockMatch[1];
    let itemMatch;
    while ((itemMatch = matchRegex.exec(block)) !== null) {
      const matchId = String(itemMatch[1]);
      if (seen[matchId]) continue;
      seen[matchId] = true;

      const matchDesc = String(itemMatch[2] || '').trim();
      const state = String(itemMatch[3] || '').trim();
      const status = String(itemMatch[4] || '').trim();
      const team1 = String(itemMatch[5] || '').trim();
      const team2 = String(itemMatch[6] || '').trim();
      const urlMeta = urlByMatchId[matchId] || { slug: '', scoreUrl: '', scorecardUrl: '' };

      matches.push({
        matchId: matchId,
        team1: team1,
        team2: team2,
        matchDesc: matchDesc,
        state: state,
        status: status,
        slug: urlMeta.slug,
        scoreUrl: urlMeta.scoreUrl,
        scorecardUrl: urlMeta.scorecardUrl
      });
    }
  }

  return matches;
}

function normalizeName_(name) {
  return String(name || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function getSheet_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME)
    || SpreadsheetApp.getActiveSpreadsheet().insertSheet(SHEET_NAME);

  const headers = [
    'timestamp',
    'name',
    'normalizedName',
    'matchId',
    'matchLabel',
    'team1',
    'team2',
    'state',
    'selectedPlayerIds',
    'selectedPlayerNames',
    'selectedPlayersJson',
    'starPlayerId',
    'starPlayerName',
    'momPlayerId',
    'momPlayerName'
  ];

  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }

  return sheet;
}

function getSubmission_(name, matchId) {
  const normalizedName = normalizeName_(name);
  if (!normalizedName || !matchId) {
    return { ok: false, exists: false, message: 'Name and matchId are required.' };
  }

  const sheet = getSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return { ok: true, exists: false };
  }

  const rows = sheet.getRange(2, 1, lastRow - 1, 15).getValues();
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const row = rows[index];
    if (String(row[2]) === normalizedName && String(row[3]) === String(matchId)) {
      return {
        ok: true,
        exists: true,
        name: row[1],
        matchId: row[3],
        team1: row[5],
        team2: row[6],
        state: row[7],
        selectedPlayers: JSON.parse(row[10] || '[]'),
        starPlayerId: row[11],
        starPlayerName: row[12],
        momPlayerId: row[13],
        momPlayerName: row[14],
        submittedAt: row[0]
      };
    }
  }

  return { ok: true, exists: false };
}

function validateSelection_(payload) {
  if (!payload || !payload.name || !payload.matchId || !payload.team1 || !payload.team2) {
    throw new Error('Missing required submission fields.');
  }

  const selectedPlayers = Array.isArray(payload.selectedPlayers) ? payload.selectedPlayers : [];
  if (selectedPlayers.length !== 6) {
    throw new Error('Exactly 6 players are required.');
  }

  if (!payload.starPlayerId || !payload.momPlayerId) {
    throw new Error('Star and MoM selections are required.');
  }

  const ids = selectedPlayers.map(function (player) { return String(player.id); });
  if (ids.indexOf(String(payload.starPlayerId)) === -1 || ids.indexOf(String(payload.momPlayerId)) === -1) {
    throw new Error('Star and MoM must be part of the selected team.');
  }

  const counts = { Batter: 0, Bowler: 0, All_Rounder: 0, WK: 0 };
  selectedPlayers.forEach(function (player) {
    counts[player.role] = (counts[player.role] || 0) + 1;
  });

  if (counts.Batter > 2) throw new Error('Maximum 2 Batters allowed.');
  if (counts.Bowler > 2) throw new Error('Maximum 2 Bowlers allowed.');
  if (counts.All_Rounder < 1 || counts.All_Rounder > 5) throw new Error('All Rounders must be between 1 and 5.');
  if (counts.WK < 1 || counts.WK > 3) throw new Error('Wicket Keepers must be between 1 and 3.');
}

function isOpenSelectionState_(match) {
  const state = String((match && match.state) || '').trim().toLowerCase();
  const status = String((match && match.status) || '').trim().toLowerCase();
  return OPEN_SELECTION_STATES.indexOf(state) !== -1
    || (state === 'delay' && status.indexOf('toss delayed') !== -1);
}

function submitSelection_(payload) {
  validateSelection_(payload);

  const matches = getMatches_();
  const liveMatch = matches.filter(function (match) {
    return String(match.matchId) === String(payload.matchId);
  })[0];

  if (!liveMatch) {
    throw new Error('Match was not found in Cricbuzz live data.');
  }

  if (!isOpenSelectionState_(liveMatch)) {
    throw new Error('This match is locked because it is not open for selection.');
  }

  const normalizedName = normalizeName_(payload.name);
  const sheet = getSheet_();
  const lastRow = sheet.getLastRow();
  const newRow = [
    payload.submittedAt || new Date().toISOString(),
    String(payload.name).trim(),
    normalizedName,
    String(payload.matchId),
    String(payload.team1) + ' vs ' + String(payload.team2),
    String(payload.team1),
    String(payload.team2),
    String(liveMatch.state || payload.state || ''),
    payload.selectedPlayers.map(function (player) { return String(player.id); }).join(','),
    payload.selectedPlayers.map(function (player) { return String(player.name); }).join(', '),
    JSON.stringify(payload.selectedPlayers),
    String(payload.starPlayerId),
    String(payload.starPlayerName || ''),
    String(payload.momPlayerId),
    String(payload.momPlayerName || '')
  ];

  let existingRowNumber = 0;
  if (lastRow >= 2) {
    const rows = sheet.getRange(2, 1, lastRow - 1, 15).getValues();
    for (let index = rows.length - 1; index >= 0; index -= 1) {
      const row = rows[index];
      if (String(row[2]) === normalizedName && String(row[3]) === String(payload.matchId)) {
        existingRowNumber = index + 2;
        break;
      }
    }
  }

  if (existingRowNumber) {
    sheet.getRange(existingRowNumber, 1, 1, newRow.length).setValues([newRow]);
  } else {
    sheet.appendRow(newRow);
  }

  return {
    ok: true,
    message: 'Team saved successfully. Any newer submission before lock will replace this one.',
    matchId: payload.matchId,
    state: liveMatch.state
  };
}

function getTransformedMatchData(matchId) {
  const sheet = getSheet_();
  const lastRow = sheet.getLastRow();
  
  if (lastRow < 2) {
    return { error: "No data found in Selections sheet" };
  }
  
  // Read all data: A through O columns (15 columns total)
  const rows = sheet.getRange(2, 1, lastRow - 1, 15).getValues();
  
  const matchData = {
    matchId: matchId,
    team1: "",
    team2: "",
    state: "",
    status: "",
    submittedAt: "",
    users: []
  };
  
  let hasData = false;
  
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowMatchId = String(row[3]); // Column D: matchId
    
    if (rowMatchId === String(matchId)) {
      if (!hasData) {
        // Set match details from first occurrence
        matchData.team1 = String(row[5]); // Column F: team1
        matchData.team2 = String(row[6]); // Column G: team2  
        matchData.state = String(row[7]); // Column H: state
        matchData.status = String(row[7]); // Status same as state
        matchData.submittedAt = String(row[0]); // Column A: timestamp
        hasData = true;
      }
      
      let selectedIds = [];
      try {
        // Parse selectedPlayersJson from Column K
        const selectedPlayersJson = row[10]; // Column K: selectedPlayersJson
        if (selectedPlayersJson && selectedPlayersJson.trim()) {
          const players = JSON.parse(selectedPlayersJson);
          selectedIds = players.map(player => String(player.id));
        }
      } catch (e) {
        Logger.log(`Invalid JSON in row ${i + 2}: ${e.message}`);
        continue;
      }
      
      // Add user data using normalizedName column
      matchData.users.push({
        user: String(row[2]), // Column C: normalizedName
        selectedIds: selectedIds,
        starId: String(row[11]), // Column L: starPlayerId
        momId: String(row[13])   // Column N: momPlayerId
      });
    }
  }
  
  if (!hasData) {
    return { error: `No data found for matchId: ${matchId}` };
  }
  
  return matchData;
}
