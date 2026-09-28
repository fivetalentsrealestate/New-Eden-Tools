'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getUniverse: (refresh = false) => ipcRenderer.invoke('universe:get', { refresh }),
  getSov: (refresh = false) => ipcRenderer.invoke('sov:get', { refresh }),
  getKills: (refresh = false) => ipcRenderer.invoke('kills:get', { refresh }),
  openExternal: (url) => ipcRenderer.invoke('open:external', url),
  copy: (text) => ipcRenderer.invoke('clipboard:write', text),
  onProgress: (cb) => ipcRenderer.on('progress', (_e, p) => cb(p))
});
