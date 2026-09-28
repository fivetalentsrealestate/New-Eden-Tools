# EVE Jump Planner

*(formerly EVE Router)*

> **Just want to use it?** Open it in your browser or on your phone at the New Eden Tools website. See the main [README](../../README.md). This page covers the Windows desktop version.

> **Easiest install:** download *EVE Jump Planner Setup* from the [Releases page](https://github.com/fivetalentsrealestate/New-Eden-Tools/releases/latest) and double-click it. The steps below are only needed if you want to build it yourself.

A capital jump planner and New Eden map for EVE Online, here as a Windows desktop app:

- **Interactive star map**: every known-space system and stargate. You can pan, zoom, search, hover for details and click a system for its info. It has two layouts: *Top-down* (true 3D positions seen from above) and *Schematic* (CCP's 2D map layout).
- **Sovereignty overlay**: nullsec systems are coloured by the alliance that holds them, using live data from CCP's ESI. The list shows every alliance with its logo and system count. Click one to isolate its space on the map.
- **Jump drive planner**: pick your exact ship (every jump-capable hull, from Archon to Nomad) and your Jump Drive Calibration level (or type a custom range), then a start and a destination. It finds the route with the fewest jumps or the shortest distance and never lands in high-sec, Pochven, Zarzakh or Jove space. It also shows each leg's distance and an estimate of your jump fatigue and activation timers. Systems within range of your start are ringed on the map, and you can add systems to avoid.
- **Fuel calculator**: set your **Jump Fuel Conservation** level, plus **Jump Freighters** for JFs. You get the isotopes needed for each jump and the whole trip, the right isotope for your hull, the cargo space it takes (m³), and an approximate ISK cost at the average market price.

Map data comes from CCP's official Static Data Export. The app downloads it on first launch (one time, can take a minute) and keeps it in `%APPDATA%\EVE Jump Planner\data`. After that the map works offline. Sovereignty refreshes automatically when it's more than an hour old.

---

## 1. One-time setup

1. Install **Node.js LTS** from https://nodejs.org (take the defaults).
2. Download the repo: on GitHub click **Code → Download ZIP** (or clone it), and unzip it somewhere permanent, e.g. `C:\Users\<you>\Documents\New-Eden-Tools`.
3. In VS Code choose **File → Open Folder…** and pick the **`apps\eve-jump-planner`** folder inside it.
4. Open the terminal with **Terminal → New Terminal** and run:

   ```
   npm install
   ```

## 2. Run it from VS Code

```
npm start
```

You can also press **F5**, which uses the included "Run EVE Jump Planner" launch config.

## 3. Put an icon on your desktop

There are two ways. Use either one.

**Option A: proper installer (recommended)**

```
npm run dist
```

This builds `dist\EVE Jump Planner Setup 1.0.0.exe`. Double-click it to install. It adds an **EVE Jump Planner** icon to your desktop and to the Start menu, and it runs without VS Code or the project folder.

**Option B: quick shortcut (no install)**

```
npm run shortcut
```

This creates an **EVE Jump Planner** icon on your desktop that launches the app straight from this project folder, so keep the folder where it is.

---

## Using it

| Action | How |
|---|---|
| Pan / zoom | Drag the map, mouse wheel |
| Zoom to a system | Double-click it, or type in **Find system…** |
| Fit whole map | **Fit** button or press `F` |
| System details | Click a system → **System** tab (gates, sov, Dotlan/zKillboard links) |
| Plan jumps | **Jump planner** tab → ship, skills, From, To → **Plan route** |
| Alliance territory | Toolbar **Sovereignty**, then click an alliance in the **Sovereignty** tab |
| Hide high-sec | Untick **High-sec** in the toolbar |
| Refresh static map data | **Update map data** (bottom left), e.g. after a patch that adds systems |

**Jump range** comes from each hull's base range in CCP's data, plus 20% of base per Jump Drive Calibration level. For example, a carrier's 3.5 LY base becomes 7 LY at JDC V.

**Fuel** for each jump is *light-years × the hull's isotopes per LY × (1 − 10% × Jump Fuel Conservation)*, rounded up. Jump freighters get another 10% off per level of Jump Freighters. Fuel per LY and the isotope type come from CCP's data for each hull, so a Nomad (8,200/LY, Hydrogen) and a Rhea (10,000/LY, Nitrogen) show different numbers. Modules that change fuel use aren't included. The ISK estimate uses CCP's average market price for that isotope.

**Fatigue** estimates use CCP's published formulas. They assume you start with no fatigue and jump as soon as each timer ends. Black Ops use a 75% distance reduction and JF/Rorqual 90%.

---

## Troubleshooting

- **`npm run dist` fails with "Cannot create symbolic link"**: that's a known electron-builder issue on Windows. Turn on *Developer Mode* (Settings → System → For developers) or run VS Code as administrator, then try again. Or just use Option B.
- **Map won't load on first run**: the first launch needs internet to reach `developers.eveonline.com`. Check your firewall or VPN, then click **Try again**.
- **Sovereignty says "Could not reach ESI"**: ESI may be down (during downtime, 11:00 UTC). The app keeps showing the last sov it downloaded.
- **Test the planner logic**: run `npm test`.

## Project layout

```
main.js                  Electron window + data loading (runs in the background process)
preload.js               Safe bridge between the window and main.js
lib/sde.js               Downloads & converts CCP's Static Data Export (map + ship fuel data)
lib/esi.js               Live sovereignty, alliance names and fuel prices from ESI
renderer/index.html      The app UI
renderer/app.js          Map drawing, interaction, panels
renderer/planner.js      Jump ranges, cyno rules, route search, fatigue, fuel
renderer/style.css       Styling
build/icon.ico|png       App / desktop icon
scripts/                 Desktop-shortcut script and tests
```

Not affiliated with CCP Games. EVE Online and all related names are trademarks of CCP hf.

> Upgrading from EVE Router? The desktop app now installs as **EVE Jump Planner**, so uninstall *EVE Router* from Windows Settings → Apps. The first launch downloads the map again, because it now includes ship fuel data.
