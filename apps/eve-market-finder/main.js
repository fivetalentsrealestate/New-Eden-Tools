'use strict';

// New Eden Market Finder for Windows. It opens the live website version, so items, systems
// and stargates are always current (the site refreshes them from CCP's data every week).
// With no internet it falls back to the copy bundled with the installer.
const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const { startAutoUpdate } = require('./lib/updater');

const LIVE = 'https://fivetalentsrealestate.github.io/New-Eden-Tools/market/';
let win;

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 820,
    minHeight: 560,
    backgroundColor: '#0b0d10',
    title: 'New Eden Market Finder',
    icon: path.join(__dirname, 'build', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
  });

  let usedFallback = false;
  win.webContents.on('did-fail-load', (_e, code, _desc, _url, isMainFrame) => {
    if (!isMainFrame || usedFallback || code === -3) return; // -3 = aborted by a newer navigation
    usedFallback = true;
    win.loadFile(path.join(__dirname, 'web', 'index.html'));
  });

  // Links to other sites (and the other New Eden Tools pages) open in your normal browser.
  const external = (url) => !url.startsWith(LIVE) && !url.startsWith('file:');
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (external(url)) { e.preventDefault(); if (/^https?:\/\//.test(url)) shell.openExternal(url); }
  });
  win.on('page-title-updated', (e) => e.preventDefault());

  win.loadURL(LIVE);
  startAutoUpdate(win, 'market-finder');
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
