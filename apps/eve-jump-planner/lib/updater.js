// Keeps the installed app up to date: on startup (and every 6 hours) it checks the New Eden
// Tools GitHub Releases for a newer version, downloads it in the background, then offers to
// restart. If you choose "Later" it installs the next time you close the app.
// Only runs in the installed app, never with `npm start`. Identical in all three desktop apps.
'use strict';

const { app, dialog } = require('electron');

function startAutoUpdate(win, channel) {
  if (!app.isPackaged) return;
  let autoUpdater;
  try { ({ autoUpdater } = require('electron-updater')); } catch (e) { return; }
  autoUpdater.channel = channel;       // each app reads its own <channel>.yml from the release
  autoUpdater.allowDowngrade = false;  // setting a channel turns this on; we never want to go back
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('error', () => { /* offline or GitHub unreachable: try again later */ });
  autoUpdater.on('update-downloaded', async (info) => {
    const { response } = await dialog.showMessageBox(win && !win.isDestroyed() ? win : undefined, {
      type: 'info',
      buttons: ['Restart now', 'Later'],
      defaultId: 0,
      cancelId: 1,
      title: 'Update ready',
      message: `${app.getName()} ${info.version} is ready to install.`,
      detail: 'Restart now to use it, or it will install the next time you close the app.'
    });
    if (response === 0) setImmediate(() => autoUpdater.quitAndInstall());
  });
  const check = () => autoUpdater.checkForUpdates().catch(() => { /* ignore */ });
  check();
  setInterval(check, 6 * 60 * 60 * 1000);
}

module.exports = { startAutoUpdate };
