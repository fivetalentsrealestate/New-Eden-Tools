# New Eden Tools

Free tools for EVE Online that run in any browser, install on your phone like an app, and can also run as Windows desktop apps.

**▶ Use them now:** https://fivetalentsrealestate.github.io/New-Eden-Tools/

| | App | What it does |
|---|---|---|
| <img src="apps/market-finder/icon-192.png" width="48"> | **[Market Finder](https://fivetalentsrealestate.github.io/New-Eden-Tools/market/)** | Search any item and see every buy/sell order in New Eden, with jump counts from your current system. |
| <img src="apps/eve-router/renderer/icon-192.png" width="48"> | **[EVE Router](https://fivetalentsrealestate.github.io/New-Eden-Tools/router/)** | Interactive New Eden map with live sovereignty and a capital **jump drive** planner (ranges, cyno rules, fatigue). |
| <img src="apps/eve-gate-planner/renderer/icon-192.png" width="48"> | **[Gate Planner](https://fivetalentsrealestate.github.io/New-Eden-Tools/gates/)** | **Stargate** route planner with the in-game autopilot settings: Shorter / Safer / Less Secure, security penalty, jump bridges, pod-kill / Triglavian / EDENCOM avoidance, waypoints. |

## On your phone

Open any tool from the link above, then:

- **iPhone / iPad (Safari):** Share → **Add to Home Screen**
- **Android (Chrome):** ⋮ menu → **Install app**

It opens full-screen with its own icon and remembers your settings. On the maps you can drag to pan, pinch to zoom, and tap a system. Swipe up the bottom panel for the planner.

## On Windows (desktop app with a desktop icon)

EVE Router and Gate Planner can also be installed as desktop apps. You'll need [Node.js LTS](https://nodejs.org).

```
cd apps/eve-router          # or apps/eve-gate-planner
npm install
npm start                   # run it
npm run dist                # build an installer with a desktop icon
```

Full instructions: [EVE Router](apps/eve-router/README.md) · [Gate Planner](apps/eve-gate-planner/README.md)

## How it's built

```
apps/
  market-finder/        single-page web app
  eve-router/
    renderer/           the app UI (used by both the website and the desktop app)
    main.js, lib/       desktop (Electron) wrapper
  eve-gate-planner/     same layout as eve-router
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
