const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('electronAPI', {
  saveFile: (name, buffer) => ipcRenderer.invoke('save-file', name, buffer),
});
