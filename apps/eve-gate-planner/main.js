'use strict';

const { app, BrowserWindow, ipcMain, shell, clipboard } = require('electron');
const fs = require('fs');
const path = require('path');
const { getUniverseData, loadCached } = require('./lib/sde');
const { fetchSovereignty, loadCachedSov, fetchKills, loadCachedKills } = require('./lib/esi');

const dataDir = () => path.join(app.getPath('userData'), 'data');
let win;

function createWindow() {
  win = new BrowserWindow({
    width: 1500,
    height: 950,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#05070b',
    title: 'EVE Gate Planner',
    icon: path.join(__dirname, 'build', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
}

const progress = (p) => win && !win.isDestroyed() && win.webContents.send('progress', p);

// If EVE Jump Planner (formerly EVE Router) already downloaded the map, borrow its copy.
function borrowFromEveRouter() {
  const theirs = ['EVE Jump Planner', 'EVE Router']
    .map((n) => path.join(app.getPath('appData'), n, 'data', 'universe.json'))
    .find((f) => fs.existsSync(f));
  if (!theirs) return null;
  try {
    fs.mkdirSync(dataDir(), { recursive: true });
    fs.copyFileSync(theirs, path.join(dataDir(), 'universe.json'));
    return loadCached(dataDir());
  } catch (e) { return null; }
}

ipcMain.handle('universe:get', async (_e, { refresh } = {}) => {
  if (!refresh) {
    const cached = loadCached(dataDir()) || borrowFromEveRouter();
    if (cached) return cached;
  }
  return getUniverseData(dataDir(), progress);
});

// Cached ESI data with a max age; falls back to the last copy when offline.
async function cachedFetch(loadFn, fetchFn, maxAgeMs, refresh) {
  const cached = loadFn(dataDir());
  const stale = !cached || Date.now() - new Date(cached.fetchedAt).getTime() > maxAgeMs;
  if (!refresh && !stale) return cached;
  try {
    return await fetchFn(dataDir());
  } catch (e) {
    if (cached) return { ...cached, offline: true, error: String(e.message || e) };
    throw e;
  }
}

ipcMain.handle('sov:get', (_e, { refresh } = {}) => cachedFetch(loadCachedSov, fetchSovereignty, 60 * 60 * 1000, refresh));
ipcMain.handle('kills:get', (_e, { refresh } = {}) => cachedFetch(loadCachedKills, fetchKills, 10 * 60 * 1000, refresh));

ipcMain.handle('open:external', (_e, url) => {
  if (/^https:\/\//.test(url)) shell.openExternal(url);
});
ipcMain.handle('clipboard:write', (_e, text) => clipboard.writeText(String(text)));

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
