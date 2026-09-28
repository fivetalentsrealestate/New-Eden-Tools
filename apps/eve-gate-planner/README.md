# EVE Gate Planner

> **Just want to use it?** Open it in your browser or on your phone at the New Eden Tools website. See the main [README](../../README.md). This page covers the Windows desktop version.

A local Windows app for planning **stargate** travel in EVE Online. It uses the same route settings as the in-game autopilot:

| In-game setting | What the app does |
|---|---|
| **Prefer Shorter** – Ignore Security Status | Finds the fewest jumps. |
| **Prefer Safer** – Stay in 0.5 to 1.0 where possible | Uses CCP's published cost formula: high-sec costs 0.9 per jump, low-sec costs `e^(0.15 × penalty)`, null-sec costs twice that. |
| **Prefer Less Secure** – Stay in 0.0 to 0.4 where possible | Same formula with high-sec and low-sec swapped. |
| **Security penalty** slider (0–100, default 50) | Feeds the formula above. Higher means detours get longer to stay in your preferred security. It's greyed out for Prefer Shorter, as it is in game. |
| **Include Jump Bridges in Route** | Uses your alliance's Ansiblex list. Click **Edit** and paste it in, one bridge per line. Most formats work, e.g. `1DQ1-A » 8WA-Z6`. |
| **Avoid Systems Where Pod Killing has Recently Occurred** | Uses CCP's live kill feed (last hour). You can set the threshold, e.g. only avoid systems with 2 or more pod kills. |
| **Avoid Triglavian Minor Victory Systems** | Avoids the 28 systems the Triglavians won in the 2020 invasion. They're marked ▲ on the map. |
| **Avoid EDENCOM Systems** | Avoids EDENCOM Fortress (53) and EDENCOM Minor Victory (84) systems. They're marked ◆. |
| **Avoid Systems on Your Avoidance List** | You manage your own list. Add systems in the Route tab or from any system's page. |
| **Disable Autopilot at Each Waypoint** | Add as many waypoints as you like. When this is on, the route shows a ⏸ stop at each waypoint, and **Copy route** marks it too. |

Your start, waypoints and destination are never avoided, even if they're on a list (the game behaves the same way).

**Also included**
- Full New Eden map with pan and zoom, security or sovereignty colouring, and live kill heat from the last hour. Your route is drawn in gold and jump bridges in green.
- Every system on the route shows its security, sov holder, and ship and pod kills, plus flags for Triglavian, EDENCOM and avoided systems.
- A summary for each route: total jumps, lowest security, high/low/null count, kills along the route, and how many jump bridges it uses.
- **Copy route** puts a plain-text list of the route on your clipboard.
- Your settings, waypoints, avoidance list and bridges are remembered between sessions.

Map data comes from CCP's official Static Data Export. If **EVE Router** is already installed, this app reuses the map data it downloaded. Otherwise it downloads the data once on first launch. Sovereignty refreshes every hour, and kills every 10 minutes (CCP updates the kill feed hourly).

---

## Setup (same as EVE Router)

1. Install **Node.js LTS** from https://nodejs.org (skip if you already did this for EVE Router).
2. Download the repo (**Code → Download ZIP** on GitHub, or clone it) and unzip it somewhere permanent. In VS Code choose **File → Open Folder…** and pick the **`apps\eve-gate-planner`** folder inside it.
3. Open a terminal (**Terminal → New Terminal**) and run:
   ```
   npm install
   npm start
   ```
4. To put an icon on your desktop:
   - `npm run dist` builds an installer in `dist\` that adds an **EVE Gate Planner** icon to your desktop and Start menu, **or**
   - `npm run shortcut` makes a desktop icon that runs the app straight from this folder.

`npm test` checks the routing logic.

## Troubleshooting

- **"No route … without passing through systems you're avoiding"**: every path goes through something you've asked it to avoid. Turn off an avoid option or remove a system from your list. The pod-kill avoid option can close off chokepoints like Rancer or Tama.
- **Jump bridge lines "not understood"**: each line needs two system names. Check spelling, or add the dashes in names like `1DQ1-A`.
- **Invasion system lists**: CCP doesn't publish these through its API, so they're stored in `renderer/special-systems.js`. Edit that file if CCP ever changes them.
- **`npm run dist` fails with "Cannot create symbolic link"**: turn on Windows *Developer Mode*, or run VS Code as administrator. You can also use `npm run shortcut` instead.

Not affiliated with CCP Games. EVE Online and all related names are trademarks of CCP hf.
