import fs from "node:fs";
import path from "node:path";

const [, , inputCsvArg, outputJsonArg] = process.argv;

if (!inputCsvArg) {
  console.error("Usage: node generateTeamsJson.mjs <input.csv> [output.json]");
  process.exit(1);
}

const inputCsvPath = path.resolve(inputCsvArg);
const outputJsonPath = path.resolve(outputJsonArg ?? path.join("top6Playerselector", "data", "teams.json"));

const csvText = fs.readFileSync(inputCsvPath, "utf8").trim();
const lines = csvText.split(/\r?\n/);

if (lines.length < 2) {
  console.error("CSV does not contain enough rows.");
  process.exit(1);
}

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let insideQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"' && insideQuotes && nextChar === '"') {
      current += '"';
      i += 1;
      continue;
    }

    if (char === '"') {
      insideQuotes = !insideQuotes;
      continue;
    }

    if (char === "," && !insideQuotes) {
      values.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current);
  return values;
}

const header = parseCsvLine(lines[0]);
const columnIndex = Object.fromEntries(header.map((name, index) => [name, index]));
const teams = {};

for (const line of lines.slice(1)) {
  if (!line.trim()) continue;

  const row = parseCsvLine(line);
  const teamName = row[columnIndex.team_name]?.trim();
  const playerId = row[columnIndex.player_id]?.trim();
  const playerName = row[columnIndex.player_name]?.trim();
  const role = row[columnIndex.role]?.trim();

  if (!teamName || !playerId || !playerName || !role) continue;

  if (!teams[teamName]) {
    teams[teamName] = [];
  }

  teams[teamName].push({
    id: playerId,
    name: playerName,
    role,
    team: teamName,
  });
}

for (const teamName of Object.keys(teams)) {
  teams[teamName].sort((a, b) => a.name.localeCompare(b.name));
}

const payload = {
  generatedAt: new Date().toISOString(),
  sourceFile: inputCsvPath,
  teamCount: Object.keys(teams).length,
  teams,
};

fs.writeFileSync(outputJsonPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

console.log(`Wrote ${Object.keys(teams).length} teams to ${outputJsonPath}`);
