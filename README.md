# New Eden Tools

Free tools for EVE Online that run in any browser, install on your phone like an app, and can also run as Windows desktop apps.

**▶ Use them now:** https://fivetalentsrealestate.github.io/New-Eden-Tools/

| | App | What it does |
|---|---|---|
| <img src="apps/market-finder/icon-192.png" width="48"> | **[Market Finder](https://fivetalentsrealestate.github.io/New-Eden-Tools/market/)** | Search any item and see every buy/sell order in New Eden, with jump counts from your current system. |
| <img src="apps/eve-jump-planner/renderer/icon-192.png" width="48"> | **[EVE Jump Planner](https://fivetalentsrealestate.github.io/New-Eden-Tools/jump/)** | Capital **jump drive** planner with a fuel calculator (per hull, Jump Fuel Conservation, m³ and ISK), fatigue estimates, cyno rules, and a New Eden map with live sovereignty. |
| <img src="apps/eve-gate-planner/renderer/icon-192.png" width="48"> | **[Gate Planner](https://fivetalentsrealestate.github.io/New-Eden-Tools/gates/)** | **Stargate** route planner with the in-game autopilot settings: Shorter / Safer / Less Secure, security penalty, jump bridges, pod-kill / Triglavian / EDENCOM avoidance, waypoints. |

## On your phone

Open any tool from the link above, then:

- **iPhone / iPad (Safari):** Share → **Add to Home Screen**
- **Android (Chrome):** ⋮ menu → **Install app**

It opens full-screen with its own icon and remembers your settings. On the maps you can drag to pan, pinch to zoom, and tap a system. Swipe up the bottom panel for the planner.

## On Windows (desktop app with a desktop icon)

**[⬇ Download the installers](https://github.com/fivetalentsrealestate/New-Eden-Tools/releases/latest)**: pick *EVE Jump Planner Setup* or *EVE Gate Planner Setup* under **Assets** and double-click it. Windows may say "Windows protected your PC", because the installer isn't code-signed. Click **More info → Run anyway**.

To build them yourself instead, you'll need [Node.js LTS](https://nodejs.org):

```
cd apps/eve-jump-planner    # or apps/eve-gate-planner
npm install
npm start                   # run it
npm run dist                # build an installer with a desktop icon
```

Full instructions: [EVE Jump Planner](apps/eve-jump-planner/README.md) · [Gate Planner](apps/eve-gate-planner/README.md)

To publish new installers, push a version tag (e.g. `git tag v1.0.1 && git push origin v1.0.1`). GitHub builds both on Windows and attaches them to a new release.

## How it's built

```
apps/
  market-finder/        single-page web app
  eve-jump-planner/
    renderer/           the app UI (used by both the website and the desktop app)
    main.js, lib/       desktop (Electron) wrapper
  eve-gate-planner/     same layout as eve-jump-planner
site/                   landing page
scripts/build-site.js   assembles the website and builds the map data
.github/workflows/      publishes to GitHub Pages
```

- **Website hosting:** GitHub Pages, free. Every push to `main` rebuilds and republishes the site automatically, and it also rebuilds every Tuesday to pick up new map data after patches.
- **Map data:** built from CCP's official [Static Data Export](https://developers.eveonline.com/docs/services/static-data/) during the site build, so it's never out of date for long.
- **Live data:** sovereignty, kills and market orders come straight from CCP's public [ESI API](https://developers.eveonline.com/docs/services/esi/overview/) in the user's browser. There's no server to run and no login.
- **Web vs desktop:** the same UI code runs in both. On the web, `renderer/web-api.js` stands in for the desktop app's background process.

### Working on it locally

```
npm install
npm test                 # route planner tests
npm run build            # builds _site/ (downloads CCP's static data, ~1 min)
npm run preview          # http://localhost:8080
```

## License

MIT. See [LICENSE](LICENSE).

EVE Online and all related names, images and data are trademarks and property of CCP hf. These tools are not affiliated with or endorsed by CCP Games.
