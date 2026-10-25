'use strict';
const {contextBridge, ipcRenderer} = require('electron');
contextBridge.exposeInMainWorld('forgeDesktop', Object.freeze({
  platform: 'win32',
  chooseProject: () => ipcRenderer.invoke('desktop:choose-project'),
  connection: () => ipcRenderer.invoke('desktop:connection'),
  retry: () => ipcRenderer.invoke('desktop:retry'),
  showData: () => ipcRenderer.invoke('desktop:show-data'),
  onAction: callback => {
    if (typeof callback !== 'function') return () => {};
    const handler = (_event, action) => callback(action);
    ipcRenderer.on('desktop:action', handler);
    return () => ipcRenderer.removeListener('desktop:action', handler);
  }
}));
