(function () {
  const config = window.TOP6_CONFIG || {
    appsScriptUrl: "",
    lockStates: ["in progress", "live", "complete"],
    storageKeys: {
      userName: "top6_playerselector_user_name",
      lastSubmissionPrefix: "top6_playerselector_submission_"
    }
  };

  const MAX_PLAYERS = 6;
  const RULES = {
    bat: { max: 2 },
    bowl: { max: 2 },
    ar: { min: 1, max: 5 },
    wk: { min: 1, max: 3 }
  };
  const ROLE_ORDER = ["Batter", "Bowler", "All_Rounder", "WK"];
  const ROLE_LABELS = {
    Batter: "Batters",
    Bowler: "Bowlers",
    All_Rounder: "All Rounders",
    WK: "Wicket Keepers"
  };
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

  function setUserName(name) {
    window.localStorage.setItem(config.storageKeys.userName, normalizeName(name));
  }

  function getSubmissionKey(matchId) {
    return `${config.storageKeys.lastSubmissionPrefix}${matchId}`;
  }

  function saveSubmissionCache(matchId, payload) {
    window.localStorage.setItem(getSubmissionKey(matchId), JSON.stringify(payload));
  }

  function loadSubmissionCache(matchId) {
    const raw = window.localStorage.getItem(getSubmissionKey(matchId));
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function roleToKey(role) {
    switch (role) {
      case "Batter":
        return "bat";
      case "Bowler":
        return "bowl";
      case "All_Rounder":
        return "ar";
      case "WK":
        return "wk";
      default:
        return "bat";
    }
  }

  function getTeamComposition(selected) {
    return {
      batters: selected.filter((p) => p.role === "Batter").length,
      bowlers: selected.filter((p) => p.role === "Bowler").length,
      allRounders: selected.filter((p) => p.role === "All_Rounder").length,
      keepers: selected.filter((p) => p.role === "WK").length
    };
  }

  function getDisabledRoles(selected) {
    const counts = {
      bat: selected.filter((p) => p.role === "Batter").length,
      bowl: selected.filter((p) => p.role === "Bowler").length,
      ar: selected.filter((p) => p.role === "All_Rounder").length,
      wk: selected.filter((p) => p.role === "WK").length
    };

    const remaining = MAX_PLAYERS - selected.length;
    const disabled = new Set();

    if (remaining === 0) {
      return new Set(ROLE_ORDER);
    }

    if (counts.bat >= RULES.bat.max) disabled.add("Batter");
    if (counts.bowl >= RULES.bowl.max) disabled.add("Bowler");
    if (counts.ar >= RULES.ar.max) disabled.add("All_Rounder");
    if (counts.wk >= RULES.wk.max || (counts.wk === 1 && counts.bat === 2) || (counts.wk === 2 && counts.bat === 1)) {
      disabled.add("WK");
      disabled.add("Batter");
    }

    for (const role of ROLE_ORDER) {
      if (disabled.has(role)) continue;

      const key = roleToKey(role);
      const simCounts = { ...counts, [key]: counts[key] + 1 };
      const simRemaining = remaining - 1;
      const arStillNeeded = Math.max(0, RULES.ar.min - simCounts.ar);
      const wkStillNeeded = Math.max(0, RULES.wk.min - simCounts.wk);

      if (arStillNeeded + wkStillNeeded > simRemaining) {
        disabled.add(role);
      }
    }

    return disabled;
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

  async function fetchSubmission(name, matchId) {
    if (!hasAppsScript) {
      const cached = loadSubmissionCache(matchId);
      if (cached && String(cached.name).trim().toLowerCase() === String(name).trim().toLowerCase()) {
        return { ok: true, exists: true, ...cached };
      }
      return { ok: true, exists: false };
    }

    const response = await fetch(buildAppsScriptUrl("submission", { name, matchId }), {
      method: "GET",
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error("Unable to load saved submission.");
    }

    return parseJsonSafe(response);
  }

  async function submitSelection(payload) {
    if (!hasAppsScript) {
      saveSubmissionCache(payload.matchId, payload);
      return {
        ok: true,
        message: "Local test submission saved in this browser. Add Apps Script later to save it to Google Sheets.",
        matchId: payload.matchId,
        state: payload.state
      };
    }

    const response = await fetch(buildAppsScriptUrl("submit"), {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error("Unable to submit selection.");
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
    const value = String(state || "").toLowerCase();
    if (config.lockStates.includes(value)) return "locked";
    if (["preview", "upcoming", "toss", "toss soon", "toss in progress"].includes(value)) return "upcoming";
    return "live";
  }

  function isLockedState(state) {
    return config.lockStates.includes(String(state || "").trim().toLowerCase());
  }

  function groupByRole(players) {
    return {
      Batter: players.filter((p) => p.role === "Batter"),
      Bowler: players.filter((p) => p.role === "Bowler"),
      All_Rounder: players.filter((p) => p.role === "All_Rounder"),
      WK: players.filter((p) => p.role === "WK")
    };
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

  function openSubmitModal(mode, text) {
    const modal = $("submit-modal");
    if (!modal) return;
    const title = $("submit-modal-title");
    const body = $("submit-modal-text");
    const spinner = $("submit-modal-spinner");
    const check = $("submit-modal-check");
    const close = $("submit-modal-close");

    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden", "false");

    if (mode === "loading") {
      title.textContent = "Submitting...";
      body.textContent = text || "Saving your team, please wait.";
      spinner.classList.remove("hidden");
      check.classList.add("hidden");
      close.classList.add("hidden");
      return;
    }

    if (mode === "success") {
      title.textContent = "Submitted!";
      body.textContent = text || "Your team has been saved successfully.";
      spinner.classList.add("hidden");
      check.classList.remove("hidden");
      close.classList.remove("hidden");
      return;
    }

    if (mode === "error") {
      title.textContent = "Submit failed";
      body.textContent = text || "Unable to submit right now.";
      spinner.classList.add("hidden");
      check.classList.add("hidden");
      close.classList.remove("hidden");
    }
  }

  function closeSubmitModal() {
    const modal = $("submit-modal");
    if (!modal) return;
    modal.classList.add("hidden");
    modal.setAttribute("aria-hidden", "true");
  }

  function redirectToNameIfMissing() {
    if (!getUserName()) {
      window.location.href = "./index.html";
      return true;
    }
    return false;
  }

  function initIndexPage() {
    const form = $("name-form");
    if (!form) return;

    const nameInput = $("user-name");
    const saved = getUserName();
    if (saved) {
      nameInput.value = saved;
    }

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const value = normalizeName(nameInput.value || "");
      if (!value) {
        nameInput.focus();
        return;
      }
      setUserName(value);
      window.location.href = "./matches.html";
    });
  }

  async function initMatchesPage() {
    const listNode = $("match-list");
    if (!listNode) return;
    if (redirectToNameIfMissing()) return;

    $("current-user-name").textContent = getUserName();
    const searchInput = $("match-search");
    const filterSelect = $("match-filter");
    const messageNode = $("matches-message");

    let matches = [];

    function render(items) {
      if (!items.length) {
        listNode.innerHTML = '<div class="empty-state">No matches found for this filter.</div>';
        return;
      }

      listNode.innerHTML = items.map((match) => {
        const stateClass = getStatusClass(match.state);
        const params = new URLSearchParams({ matchId: match.matchId });
        return `
          <article class="match-card">
            <div class="match-header">
              <div>
                <p class="eyebrow">${escapeHtml(match.matchDesc || "IPL Match")}</p>
                <h2 class="match-teamline">${escapeHtml(match.team1)} vs ${escapeHtml(match.team2)}</h2>
              </div>
              <span class="status-pill ${stateClass}">${escapeHtml(match.state || "unknown")}</span>
            </div>
            <p class="subtitle">${escapeHtml(match.status || "Build your Top 6 before the game locks.")}</p>
            <div class="match-footer">
              <button class="match-open" type="button" data-href="./select.html?${params.toString()}">Open Selection</button>
            </div>
          </article>
        `;
      }).join("");

      listNode.querySelectorAll("[data-href]").forEach((button) => {
        button.addEventListener("click", () => {
          window.location.href = button.getAttribute("data-href");
        });
      });
    }

    function applyFilters() {
      const query = (searchInput.value || "").trim().toLowerCase();
      const filter = filterSelect.value;
      let filtered = [...matches];

      if (query) {
        filtered = filtered.filter((match) => {
          const haystack = `${match.team1} ${match.team2} ${match.matchDesc || ""}`.toLowerCase();
          return haystack.includes(query);
        });
      }

      if (filter !== "all") {
        filtered = filtered.filter((match) => {
          const state = String(match.state || "").toLowerCase();
          if (filter === "locked") return isLockedState(state);
          if (filter === "upcoming") return !isLockedState(state);
          return state === filter;
        });
      }

      // Re-sort filtered matches to maintain correct order
      filtered.sort((a, b) => {
        const aLocked = isLockedState(a.state) ? 1 : 0;
        const bLocked = isLockedState(b.state) ? 1 : 0;
        if (aLocked !== bLocked) return aLocked - bLocked;
        // Only for locked/completed matches, show latest first (highest matchId)
        // For all other matches, keep ascending order (oldest first)
        return aLocked === 1 && bLocked === 1 ? 
          Number(b.matchId) - Number(a.matchId) : 
          Number(a.matchId) - Number(b.matchId);
      });

      render(filtered);
    }

    searchInput.addEventListener("input", applyFilters);
    filterSelect.addEventListener("change", applyFilters);

    try {
      if (!hasAppsScript) {
        showMessage(messageNode, "Apps Script URL is blank, so the page is running in local test mode with sample matches and browser-only submissions.", "success");
      } else {
        hideMessage(messageNode);
      }
      matches = await fetchMatches();
      matches.sort((a, b) => {
        const aLocked = isLockedState(a.state) ? 1 : 0;
        const bLocked = isLockedState(b.state) ? 1 : 0;
        if (aLocked !== bLocked) return aLocked - bLocked;
        // Only for locked/completed matches, show latest first (highest matchId)
        // For all other matches, keep ascending order (oldest first)
        return aLocked === 1 && bLocked === 1 ? 
          Number(b.matchId) - Number(a.matchId) : 
          Number(a.matchId) - Number(b.matchId);
      });
      applyFilters();
    } catch (error) {
      showMessage(messageNode, error.message, "error");
      listNode.innerHTML = '<div class="empty-state">Unable to load matches.</div>';
    }
  }

  async function initSelectPage() {
    const root = $("selection-root");
    if (!root) return;
    if (redirectToNameIfMissing()) return;

    const params = new URLSearchParams(window.location.search);
    const matchId = params.get("matchId") || "";
    const userName = getUserName();
    $("selected-user-name").textContent = userName;

    if (!matchId) {
      showMessage($("selection-message"), "Match ID is missing.", "error");
      return;
    }

    const state = {
      matchId,
      match: null,
      players: [],
      filteredPlayers: [],
      selected: [],
      starId: "",
      momId: "",
      locked: false,
      searchQuery: "",
      roleFilter: "Batter",
      teamFilter: "all"
    };

    const messageNode = $("selection-message");
    const roleTabWrap = $("role-tabs");
    const teamFilterSelect = $("team-filter");
    const searchInput = $("player-search");
    const submitButton = $("submit-selection");
    const lockBanner = $("lock-banner");
    const lockText = $("lock-text");
    const submitModalClose = $("submit-modal-close");
    const themeToggle = $("theme-toggle");
    const cricketField = $("cricket-field");
    const viewOtherTeamsButton = $("view-other-teams");

    if (submitModalClose) {
      submitModalClose.addEventListener("click", closeSubmitModal);
    }

    document.querySelectorAll("[data-close-submit-modal]").forEach((node) => {
      node.addEventListener("click", () => {
        if (!submitModalClose || submitModalClose.classList.contains("hidden")) return;
        closeSubmitModal();
      });
    });

    function isSelected(playerId) {
      return state.selected.some((player) => String(player.id) === String(playerId));
    }

    function getPlayerById(playerId) {
      return state.players.find((player) => String(player.id) === String(playerId)) || null;
    }

    function canSubmit() {
      return state.selected.length === MAX_PLAYERS && !!state.starId && !!state.momId;
    }

    function syncLockState() {
      state.locked = isLockedState(state.match?.state);
      lockBanner.classList.toggle("hidden", !state.locked);
      if (state.locked) {
        lockText.textContent = `This match is ${state.match.state}. Editing is locked, but your saved team is still visible.`;
      }
    }

    function renderSummary() {
      $("match-title").textContent = `${state.match.team1} vs ${state.match.team2}`;
      $("match-desc").textContent = state.match.matchDesc || "IPL Match";
      $("match-state").textContent = state.match.state || "unknown";
      $("match-state").className = `status-pill ${getStatusClass(state.match.state)}`;
      $("selection-count").textContent = `${state.selected.length} / ${MAX_PLAYERS}`;

      const composition = getTeamComposition(state.selected);
      $("batters-count").textContent = composition.batters;
      $("bowlers-count").textContent = composition.bowlers;
      $("allrounders-count").textContent = composition.allRounders;
      $("keepers-count").textContent = composition.keepers;

      renderCricketField();

      submitButton.disabled = state.locked || !canSubmit();
      $("submit-helper").textContent = state.locked
        ? "The match has already started, so resubmission is disabled."
        : canSubmit()
          ? "Ready to submit. A later submission replaces your earlier one until lock."
          : "Select exactly 6 players and choose both Star and MoM.";

      // Show/hide "View other teams" button based on match state
      if (viewOtherTeamsButton) {
        const isMatchStarted = isLockedState(state.match?.state);
        viewOtherTeamsButton.classList.toggle("hidden", !isMatchStarted);
        if (isMatchStarted && hasAppsScript) {
          viewOtherTeamsButton.disabled = false;
        } else if (!hasAppsScript) {
          viewOtherTeamsButton.disabled = true;
          viewOtherTeamsButton.title = "Not available in local test mode";
        }
      }
    }
    
    
    function renderCricketField() {
      cricketField.classList.remove("hidden");
      
      // Clear all slots
      const slots = cricketField.querySelectorAll(".player-slot");
      slots.forEach(slot => {
        slot.innerHTML = "";
        slot.classList.remove("occupied", "star", "mom");
      });
      
      // Sort players by role order: Batter → Bowler → All-rounder → WK
      const roleOrder = ['Batter', 'Bowler', 'All_Rounder', 'WK'];
      const sortedPlayers = [...state.selected].sort((a, b) => {
        const aRoleIndex = roleOrder.indexOf(a.role);
        const bRoleIndex = roleOrder.indexOf(b.role);
        if (aRoleIndex !== bRoleIndex) {
          return aRoleIndex - bRoleIndex;
        }
        // Within same role, maintain original order
        return state.selected.indexOf(a) - state.selected.indexOf(b);
      });
      
      // Fill slots 1-6 with sorted players
      sortedPlayers.forEach((player, index) => {
        if (index >= 6) return; // Only fill first 6 slots
        
        const pid = String(player.id);
        const slotElement = cricketField.querySelector(`.slot-${index + 1}`);
        
        if (slotElement) {
          const isStar = state.starId === pid;
          const isMom = state.momId === pid;
          
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
            <button class="slot-remove" data-remove-id="${escapeHtml(pid)}" aria-label="Remove player">×</button>
          `;
        }
      });
      
      // Add remove functionality to slots
      cricketField.querySelectorAll("[data-remove-id]").forEach((button) => {
        button.addEventListener("click", (e) => {
          e.stopPropagation();
          if (state.locked) return;
          togglePlayer(button.getAttribute("data-remove-id"));
        });
      });
    }

    function renderPlayerColumns() {
      const disabledRoles = getDisabledRoles(state.selected);
      const grouped = groupByRole(state.filteredPlayers);
      const activeRole = state.roleFilter;
      
      // Only show the active role column
      const players = grouped[activeRole] || [];
      const cards = players.map((player) => {
        const pid = String(player.id);
        const selected = isSelected(pid);
        const disabled = !selected && (state.locked || disabledRoles.has(player.role));
        const starActive = state.starId === pid;
        const momActive = state.momId === pid;

        return `
          <div class="player-card">
            <div class="player-topline">
              <div>
                <div class="player-name">${escapeHtml(player.name)}</div>
                <div class="player-meta">${escapeHtml(player.team)}</div>
              </div>
              <span class="small-pill">${escapeHtml(player.role.replace("_", " "))}</span>
            </div>
            <button class="player-toggle ${selected ? "selected" : ""}" type="button" data-player-id="${escapeHtml(pid)}" ${disabled ? "disabled" : ""}>
              ${selected ? "Selected" : "Add to team"}
            </button>
            ${selected ? `
              <div class="special-row">
                <button class="special-button ${starActive ? "active" : ""}" type="button" data-star-id="${escapeHtml(pid)}" ${state.locked ? "disabled" : ""}>Star</button>
                <button class="special-button ${momActive ? "active" : ""}" type="button" data-mom-id="${escapeHtml(pid)}" ${state.locked ? "disabled" : ""}>MoM</button>
              </div>
            ` : ""}
          </div>
        `;
      }).join("");

      const column = `
        <section class="role-column">
          <div class="role-header">${ROLE_LABELS[activeRole]}</div>
          <div class="player-list">${cards || '<div class="empty-state">No players in this role.</div>'}</div>
        </section>
      `;

      const grid = $("role-grid");
      grid.innerHTML = column;

      grid.querySelectorAll("[data-player-id]").forEach((button) => {
        button.addEventListener("click", () => togglePlayer(button.getAttribute("data-player-id")));
      });
      grid.querySelectorAll("[data-star-id]").forEach((button) => {
        button.addEventListener("click", () => markSpecial(button.getAttribute("data-star-id"), "star"));
      });
      grid.querySelectorAll("[data-mom-id]").forEach((button) => {
        button.addEventListener("click", () => markSpecial(button.getAttribute("data-mom-id"), "mom"));
      });
    }

    function getPlayerRole(playerId) {
      const player = state.players.find(p => String(p.id) === String(playerId));
      return player ? player.role : null;
    }

    function switchToRoleTab(role) {
      const tabButton = roleTabWrap.querySelector(`[data-role-tab="${role}"]`);
      if (tabButton) {
        roleTabWrap.querySelectorAll("[data-role-tab]").forEach(node => node.classList.remove("active"));
        tabButton.classList.add("active");
        state.roleFilter = role;
        applyFilters();
      }
    }

    function applyFilters() {
      let filtered = [...state.players];

      // Universal search: Apply name search to ALL players first
      if (state.searchQuery) {
        const needle = state.searchQuery.toLowerCase();
        filtered = filtered.filter((player) => player.name.toLowerCase().includes(needle));
        
        // Auto-switch to tab if search results contain players from different role
        if (filtered.length > 0) {
          const foundRoles = [...new Set(filtered.map(p => p.role))];
          const currentRole = state.roleFilter;
          
          // If current tab has no results but other roles do, switch to first available
          if (!filtered.some(p => p.role === currentRole) && foundRoles.length > 0) {
            const roleOrder = ['Batter', 'Bowler', 'All_Rounder', 'WK'];
            for (const role of roleOrder) {
              if (foundRoles.includes(role)) {
                switchToRoleTab(role);
                break;
              }
            }
          }
        }
      }

      // Apply team filter next (affects all roles)
      if (state.teamFilter !== "all") {
        filtered = filtered.filter((player) => player.team === state.teamFilter);
      }

      // Apply role filter LAST (only for display in role tabs)
      if (state.roleFilter !== "all") {
        filtered = filtered.filter((player) => player.role === state.roleFilter);
      }

      state.filteredPlayers = filtered;
      renderPlayerColumns();
      renderSummary();
    }

    function togglePlayer(playerId) {
      if (state.locked) return;
      const existing = isSelected(playerId);

      if (existing) {
        state.selected = state.selected.filter((player) => String(player.id) !== String(playerId));
        if (state.starId === String(playerId)) state.starId = "";
        if (state.momId === String(playerId)) state.momId = "";
      } else {
        const player = getPlayerById(playerId);
        if (!player) return;
        const disabledRoles = getDisabledRoles(state.selected);
        if (disabledRoles.has(player.role)) return;
        state.selected = [...state.selected, player];
      }

      applyFilters();
    }

    function markSpecial(playerId, type) {
      if (state.locked || !isSelected(playerId)) return;
      if (type === "star") state.starId = String(playerId);
      if (type === "mom") state.momId = String(playerId);
      renderPlayerColumns();
      renderSummary();
    }

    function hydrateSavedSelection(savedPayload) {
      if (!savedPayload || !Array.isArray(savedPayload.selectedPlayers)) return;

      const validPlayers = savedPayload.selectedPlayers
        .map((item) => getPlayerById(item.id) || getPlayerById(String(item.id)))
        .filter(Boolean);

      state.selected = validPlayers;
      state.starId = String(savedPayload.starPlayerId || "");
      state.momId = String(savedPayload.momPlayerId || "");
    }

    async function loadSavedSelection() {
      const fallback = loadSubmissionCache(matchId);
      if (fallback) {
        hydrateSavedSelection(fallback);
      }

      try {
        const payload = await fetchSubmission(userName, matchId);
        if (payload && payload.exists) {
          hydrateSavedSelection(payload);
          saveSubmissionCache(matchId, payload);
        }
      } catch {
        // Keep cached local state if Apps Script is not reachable.
      }
    }

    function buildTeamOptions() {
      const uniqueTeams = Array.from(new Set(state.players.map((player) => player.team)));
      teamFilterSelect.innerHTML = ['<option value="all">All teams</option>']
        .concat(uniqueTeams.map((team) => `<option value="${escapeHtml(team)}">${escapeHtml(team)}</option>`))
        .join("");
    }

    async function loadPageData() {
      const [matches, teamsData] = await Promise.all([fetchMatches(), fetchTeamsData()]);
      state.match = matches.find((match) => String(match.matchId) === String(matchId));
      if (!state.match) {
        throw new Error("This match could not be found in the live match list.");
      }

      const team1Players = teamsData.teams[state.match.team1] || [];
      const team2Players = teamsData.teams[state.match.team2] || [];

      if (!team1Players.length || !team2Players.length) {
        throw new Error(`Missing squad data for ${state.match.team1} or ${state.match.team2}.`);
      }

      state.players = [...team1Players, ...team2Players];
      state.filteredPlayers = [...state.players];
      syncLockState();
      buildTeamOptions();
      await loadSavedSelection();
      applyFilters();
    }

    searchInput.addEventListener("input", (event) => {
      state.searchQuery = event.target.value || "";
      applyFilters();
    });

    roleTabWrap.querySelectorAll("[data-role-tab]").forEach((button) => {
      button.addEventListener("click", () => {
        roleTabWrap.querySelectorAll("[data-role-tab]").forEach((node) => node.classList.remove("active"));
        button.classList.add("active");
        state.roleFilter = button.getAttribute("data-role-tab");
        applyFilters();
      });
    });

    teamFilterSelect.addEventListener("change", (event) => {
      state.teamFilter = event.target.value;
      applyFilters();
    });
    
    
    
    // Add view other teams button functionality
    if (viewOtherTeamsButton) {
      viewOtherTeamsButton.addEventListener("click", () => {
        // Pass match data as URL parameter (like props)
        const matchParam = encodeURIComponent(JSON.stringify(state.match));
        const teamsUrl = `./teams.html?matchId=${encodeURIComponent(state.matchId)}&match=${matchParam}`;
        window.location.href = teamsUrl;
      });
    }

    // Add swipe gesture support for mobile
    let touchStartX = 0;
    let touchEndX = 0;
    
    const roleGrid = $("role-grid");
    
    roleGrid.addEventListener("touchstart", (event) => {
      touchStartX = event.changedTouches[0].screenX;
    }, { passive: true });
    
    roleGrid.addEventListener("touchend", (event) => {
      touchEndX = event.changedTouches[0].screenX;
      handleSwipe();
    }, { passive: true });
    
    function handleSwipe() {
      const swipeThreshold = 50;
      const diff = touchStartX - touchEndX;
      
      if (Math.abs(diff) < swipeThreshold) return;
      
      const currentRoleIndex = ROLE_ORDER.indexOf(state.roleFilter);
      let newIndex;
      
      if (diff > 0) {
        // Swipe left - go to next tab
        newIndex = (currentRoleIndex + 1) % ROLE_ORDER.length;
      } else {
        // Swipe right - go to previous tab
        newIndex = currentRoleIndex === 0 ? ROLE_ORDER.length - 1 : currentRoleIndex - 1;
      }
      
      const newRole = ROLE_ORDER[newIndex];
      const newTab = roleTabWrap.querySelector(`[data-role-tab="${newRole}"]`);
      
      if (newTab) {
        roleTabWrap.querySelectorAll("[data-role-tab]").forEach((node) => node.classList.remove("active"));
        newTab.classList.add("active");
        state.roleFilter = newRole;
        applyFilters();
      }
    }

    submitButton.addEventListener("click", async () => {
      if (state.locked || !canSubmit()) return;

      try {
        submitButton.disabled = true;
        openSubmitModal("loading", "Saving your latest team, please wait.");
        showMessage(messageNode, "Submitting your latest team...", "success");

        const payload = {
          name: userName,
          normalizedName: userName.toLowerCase(),
          matchId: state.matchId,
          team1: state.match.team1,
          team2: state.match.team2,
          state: state.match.state,
          selectedPlayers: state.selected.map((player) => ({
            id: String(player.id),
            name: player.name,
            role: player.role,
            team: player.team
          })),
          starPlayerId: state.starId,
          starPlayerName: getPlayerById(state.starId)?.name || "",
          momPlayerId: state.momId,
          momPlayerName: getPlayerById(state.momId)?.name || "",
          submittedAt: new Date().toISOString()
        };

        const response = await submitSelection(payload);
        saveSubmissionCache(matchId, payload);
        openSubmitModal("success", response.message || "Your team has been saved successfully.");
        showMessage(messageNode, response.message || "Team saved. Any later submission before lock will replace this one.", "success");
      } catch (error) {
        openSubmitModal("error", error.message || "Unable to submit right now.");
        showMessage(messageNode, error.message || "Unable to submit right now.", "error");
      } finally {
        renderSummary();
      }
    });

    try {
      await loadPageData();
      if (!hasAppsScript) {
        showMessage(messageNode, "Local test mode is active. This browser will remember your latest submission for each match until you wire Apps Script.", "success");
      } else {
        hideMessage(messageNode);
      }
    } catch (error) {
      showMessage(messageNode, error.message, "error");
      root.classList.add("hidden");
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    initIndexPage();
    initMatchesPage();
    initSelectPage();
  });
})();
