'use strict';

const { app, BrowserWindow, ipcMain, shell, clipboard } = require('electron');
const path = require('path');
const { getUniverseData, loadCached } = require('./lib/sde');
const { fetchSovereignty, loadCachedSov, fetchPrices, loadCachedPrices } = require('./lib/esi');

const dataDir = () => path.join(app.getPath('userData'), 'data');
let win;

function createWindow() {
  win = new BrowserWindow({
    width: 1500,
    height: 950,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#05070b',
    title: 'EVE Jump Planner',
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

  // Open outside links (e.g. Dotlan, zKillboard) in the normal browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
}

const progress = (p) => win && !win.isDestroyed() && win.webContents.send('progress', p);

ipcMain.handle('universe:get', async (_e, { refresh } = {}) => {
  if (!refresh) {
    // Needs the per-ship fuel data; older downloads without it are rebuilt once.
    const cached = loadCached(dataDir(), { needShips: true });
    if (cached) return cached;
  }
  return getUniverseData(dataDir(), progress, { needShips: true });
});

ipcMain.handle('sov:get', async (_e, { refresh } = {}) => {
  const cached = loadCachedSov(dataDir());
  const stale = !cached || Date.now() - new Date(cached.fetchedAt).getTime() > 60 * 60 * 1000;
  if (!refresh && !stale) return cached;
  try {
    return await fetchSovereignty(dataDir());
  } catch (e) {
    if (cached) return { ...cached, offline: true, error: String(e.message || e) };
    throw e;
  }
});

ipcMain.handle('prices:get', async (_e, { typeIds, refresh } = {}) => {
  const cached = loadCachedPrices(dataDir(), typeIds);
  const stale = !cached || Date.now() - new Date(cached.fetchedAt).getTime() > 6 * 60 * 60 * 1000;
  if (!refresh && !stale) return cached;
  try {
    return await fetchPrices(dataDir(), typeIds);
  } catch (e) {
    if (cached) return { ...cached, offline: true };
    throw e;
  }
});

ipcMain.handle('open:external', (_e, url) => {
  if (/^https:\/\//.test(url)) shell.openExternal(url);
});
ipcMain.handle('clipboard:write', (_e, text) => clipboard.writeText(String(text)));

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
