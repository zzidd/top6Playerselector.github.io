# top6Playerselector

Static GitHub Pages player selector that:

- asks only for the user's name
- fetches the live IPL match list and match state through Google Apps Script
- reads squad players from `data/teams.json`
- enforces the same Top 6 rules as the current app
- stores only the latest submission per `name + matchId`
- still shows the saved team after the match is locked

## Folder layout

- `index.html`: name capture page
- `matches.html`: live match list
- `select.html`: player selector
- `style.css`: shared styling
- `app.js`: frontend logic
- `config.js`: Apps Script endpoint configuration
- `data/teams.json`: generated squad data
- `scripts/generateTeamsJson.mjs`: converts the exported CSV into `teams.json`
- `appsscript/Code.gs`: Apps Script backend-free web app

## Update squad data

Regenerate `data/teams.json` from the exported players CSV:

```bash
node top6Playerselector/scripts/generateTeamsJson.mjs "C:\Users\Siddesh\Downloads\data-1777311740175.csv"
```

## Google Apps Script setup

1. Create a new Google Sheet.
2. Open `Extensions -> Apps Script`.
3. Replace the default code with the contents of `appsscript/Code.gs`.
4. Save the project.
5. Deploy as a web app:
   - Execute as: `Me`
   - Who has access: `Anyone`
6. Copy the web app URL.
7. Paste the URL into `config.js`:

```js
window.TOP6_CONFIG = {
  appsScriptUrl: "YOUR_WEB_APP_URL_HERE",
  seriesName: "IPL 2026",
  lockStates: ["in progress", "live", "complete"],
  storageKeys: {
    userName: "top6_playerselector_user_name",
    lastSubmissionPrefix: "top6_playerselector_submission_"
  }
};
```

## GitHub Pages deploy

1. Push this folder to GitHub.
2. In repo settings, enable GitHub Pages.
3. Publish from the branch/folder that contains `top6Playerselector`.
4. Open `index.html` from the Pages site.

## Notes

- `teams.json` keys must match Cricbuzz team names exactly.
- The frontend caches the latest submission in `localStorage` as a fallback.
- The live lock still depends on Cricbuzz state values coming through Apps Script.
- If Cricbuzz changes page structure, the Apps Script parser in `Code.gs` may need a small regex update.
