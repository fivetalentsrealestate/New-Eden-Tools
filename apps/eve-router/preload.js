'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getUniverse: (refresh = false) => ipcRenderer.invoke('universe:get', { refresh }),
  getSov: (refresh = false) => ipcRenderer.invoke('sov:get', { refresh }),
  openExternal: (url) => ipcRenderer.invoke('open:external', url),
  onProgress: (cb) => ipcRenderer.on('progress', (_e, p) => cb(p))
});
