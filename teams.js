(function () {
  const config = window.TOP6_CONFIG || {
    appsScriptUrl: "",
    openStates: ["upcoming", "preview", "toss"],
    storageKeys: {
      userName: "top6_playerselector_user_name",
      lastSubmissionPrefix: "top6_playerselector_submission_"
    }
  };
  const openStates = config.openStates || ["upcoming", "preview", "toss"];

  const ROLE_ORDER = ["Batter", "Bowler", "All_Rounder", "WK"];
  const hasAppsScript = Boolean((config.appsScriptUrl || "").trim());

  function $(id) {
    return document.getElementById(id);
  }

  function getUserName() {
    return (window.localStorage.getItem(config.storageKeys.userName) || "").trim();
  }

  function normalizeName(name) {
    return name.trim().replace(/\s+/g, " ");
  }

  function parseJsonSafe(response) {
    return response.text().then((text) => {
      try {
        return JSON.parse(text);
      } catch {
        throw new Error(text || "Invalid server response");
      }
    });
  }

  function buildAppsScriptUrl(action, params) {
    if (!hasAppsScript) {
      throw new Error("Apps Script URL is missing.");
    }

    const url = new URL(config.appsScriptUrl);
    url.searchParams.set("action", action);

    Object.entries(params || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    });

    return url.toString();
  }

  async function fetchMatches() {
    if (!hasAppsScript) {
      const response = await fetch("./data/sample-matches.json", { cache: "no-store" });
      if (!response.ok) {
        throw new Error("Unable to load sample matches for local testing.");
      }
      const payload = await parseJsonSafe(response);
      return payload.matches || [];
    }

    const response = await fetch(buildAppsScriptUrl("matches"), {
      method: "GET",
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error("Unable to load matches from Apps Script.");
    }

    const payload = await parseJsonSafe(response);
    return payload.matches || [];
  }

  async function fetchTransformedMatchData(matchId) {
    if (!hasAppsScript) {
      // Return mock data for local testing
      return {
        matchId: matchId,
        team1: "Team 1",
        team2: "Team 2",
        state: "upcoming",
        status: "upcoming",
        submittedAt: new Date().toISOString(),
        users: []
      };
    }

    const response = await fetch(buildAppsScriptUrl("transformmatch", { matchId }), {
      method: "GET",
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error("Unable to load match data from Apps Script.");
    }

    return parseJsonSafe(response);
  }

  async function fetchTeamsData() {
    const response = await fetch("./data/teams.json", { cache: "no-store" });
    if (!response.ok) {
      throw new Error("Unable to load teams.json.");
    }
    return parseJsonSafe(response);
  }

  function getStatusClass(state) {
    const value = String(state || "").trim().toLowerCase();
    return openStates.includes(value) ? "upcoming" : "locked";
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function showMessage(node, text, type) {
    if (!node) return;
    node.className = `message ${type || ""}`.trim();
    node.textContent = text;
    node.classList.remove("hidden");
  }

  function hideMessage(node) {
    if (!node) return;
    node.classList.add("hidden");
    node.textContent = "";
    node.className = "message hidden";
  }

  function redirectToNameIfMissing() {
    if (!getUserName()) {
      window.location.href = "./index.html";
      return true;
    }
    return false;
  }

  function renderUsersList(users, matchData, allPlayers) {
    const grid = $("users-grid");
    
    if (!users.length) {
      grid.innerHTML = '<div class="empty-state">No teams have been submitted for this match yet.</div>';
      return;
    }

    grid.innerHTML = users.map((userData) => {
      const displayName = userData.user.charAt(0).toUpperCase() + userData.user.slice(1);
      return `
        <div class="user-card" data-user="${escapeHtml(userData.user)}">
          <div class="user-info">
            <div class="user-avatar">${escapeHtml(displayName.charAt(0).toUpperCase())}</div>
            <div>
              <h3 class="user-name">${escapeHtml(displayName)}</h3>
              <p class="user-meta">Submitted team</p>
            </div>
          </div>
          <button class="view-team-button" type="button" data-user="${escapeHtml(userData.user)}">
            View Team →
          </button>
        </div>
      `;
    }).join("");

    // Add click handlers
    grid.querySelectorAll(".view-team-button").forEach((button) => {
      button.addEventListener("click", () => {
        const userName = button.getAttribute("data-user");
        showUserTeam(userName, users, allPlayers);
      });
    });
  }

  function showUserTeam(userName, users, allPlayers) {
    const userData = users.find(u => u.user === userName);
    if (!userData) return;

    const displayName = userName.charAt(0).toUpperCase() + userName.slice(1);
    
    // Update header
    $("selected-user-name").textContent = `${displayName}'s Team`;
    
    // Show team detail section, hide users list
    $("users-grid").parentElement.classList.add("hidden");
    $("team-detail").classList.remove("hidden");

    // Get player details
    const selectedPlayers = userData.selectedIds.map(id => 
      allPlayers.find(p => String(p.id) === String(id))
    ).filter(Boolean);

    // Render team in cricket field
    renderTeamField(selectedPlayers, userData.starId, userData.momId);
  }

  function renderTeamField(selectedPlayers, starId, momId) {
    const cricketField = $("team-field");
    
    // Clear all slots
    const slots = cricketField.querySelectorAll(".player-slot");
    slots.forEach(slot => {
      slot.innerHTML = "";
      slot.classList.remove("occupied", "star", "mom");
    });
    
    // Sort players by role order: Batter → Bowler → All-rounder → WK
    const roleOrder = ['Batter', 'Bowler', 'All_Rounder', 'WK'];
    const sortedPlayers = [...selectedPlayers].sort((a, b) => {
      const aRoleIndex = roleOrder.indexOf(a.role);
      const bRoleIndex = roleOrder.indexOf(b.role);
      if (aRoleIndex !== bRoleIndex) {
        return aRoleIndex - bRoleIndex;
      }
      // Within same role, maintain original order
      return selectedPlayers.indexOf(a) - selectedPlayers.indexOf(b);
    });
    
    // Fill slots 1-6 with sorted players
    sortedPlayers.forEach((player, index) => {
      if (index >= 6) return; // Only fill first 6 slots
      
      const pid = String(player.id);
      const slotElement = cricketField.querySelector(`.slot-${index + 1}`);
      
      if (slotElement) {
        const isStar = starId === pid;
        const isMom = momId === pid;
        
        slotElement.classList.add("occupied");
        if (isStar) slotElement.classList.add("star");
        if (isMom) slotElement.classList.add("mom");
        
        let badges = "";
        if (isStar && isMom) {
          badges = `<div class="player-badges"><span class="badge-star">★</span><span class="badge-mom">M</span></div>`;
        } else if (isStar) {
          badges = `<div class="player-badges"><span class="badge-star">★</span></div>`;
        } else if (isMom) {
          badges = `<div class="player-badges"><span class="badge-mom">M</span></div>`;
        }
        
        const roleLabel = player.role.replace("_", " ");
        slotElement.innerHTML = `
          <div class="player-name-field">${escapeHtml(player.name)}</div>
          <div class="player-team-field">${escapeHtml(player.team)}</div>
          <div class="player-role-field">${escapeHtml(roleLabel)}</div>
          ${badges}
        `;
      }
    });
  }

  async function initTeamsPage() {
    if (redirectToNameIfMissing()) return;

    const params = new URLSearchParams(window.location.search);
    const matchId = params.get("matchId") || "";
    const userName = getUserName();
    
    $("current-user-name").textContent = userName;

    if (!matchId) {
      showMessage($("teams-message"), "Match ID is missing.", "error");
      return;
    }

    // Set back link
    const backToSelection = $("back-to-selection");
    if (backToSelection) {
      backToSelection.href = `./select.html?matchId=${matchId}`;
    }

    const messageNode = $("teams-message");
    const backToUsersButton = $("back-to-users");

    if (backToUsersButton) {
      backToUsersButton.addEventListener("click", () => {
        $("team-detail").classList.add("hidden");
        $("users-grid").parentElement.classList.remove("hidden");
      });
    }

    try {
      showMessage(messageNode, "Loading teams...", "success");

      // Read match data from URL parameter (like props)
      let match;
      const params = new URLSearchParams(window.location.search);
      const matchParam = params.get("match");
      
      if (matchParam) {
        try {
          match = JSON.parse(decodeURIComponent(matchParam));
        } catch (e) {
          console.warn("Failed to parse match parameter, will fetch from API");
        }
      }

      // If no match data in URL, fetch it (fallback for direct URL access)
      if (!match) {
        const matches = await fetchMatches();
        match = matches.find((m) => String(m.matchId) === String(matchId));
        if (!match) {
          throw new Error("This match could not be found in the live match list.");
        }
      }

      // Always fetch teams data and match submissions
      const [teamsData, matchData] = await Promise.all([
        fetchTeamsData(),
        fetchTransformedMatchData(matchId)
      ]);

      if (matchData.error) {
        throw new Error(matchData.error);
      }

      // Get all players for the match
      const team1Players = teamsData.teams[match.team1] || [];
      const team2Players = teamsData.teams[match.team2] || [];
      const allPlayers = [...team1Players, ...team2Players];

      // Update match info
      $("match-title").textContent = `${match.team1} vs ${match.team2}`;
      $("match-desc").textContent = match.matchDesc || "IPL Match";
      $("match-state").textContent = match.state || "unknown";
      $("match-state").className = `status-pill ${getStatusClass(match.state)}`;
      
      // Update teams count
      const teamsCount = matchData.users.length;
      $("teams-count").textContent = `${teamsCount} team${teamsCount !== 1 ? 's' : ''} submitted`;

      // Render users list
      renderUsersList(matchData.users, matchData, allPlayers);

      hideMessage(messageNode);

    } catch (error) {
      showMessage(messageNode, error.message, "error");
      console.error("Error loading teams page:", error);
    }
  }

  // Initialize page when DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initTeamsPage);
  } else {
    initTeamsPage();
  }
})();
