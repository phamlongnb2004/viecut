// Cầu nối an toàn giữa giao diện và phần native của VIECUT
// Tác giả: Phạm Thành Long (thlong)
const { contextBridge, ipcRenderer, webUtils } = require('electron');
contextBridge.exposeInMainWorld('electronAPI', {
  hasEngine: true,
  saveFile: (name, buffer) => ipcRenderer.invoke('save-file', name, buffer),
  pathOf: file => { try { return webUtils.getPathForFile(file) || ''; } catch { return ''; } },
  writeTemp: (name, buffer) => ipcRenderer.invoke('write-temp', name, buffer),
  existing: paths => ipcRenderer.invoke('existing', paths),
  chooseSave: name => ipcRenderer.invoke('choose-save', name),
  exportStart: job => ipcRenderer.invoke('export-start', job),
  exportCancel: () => ipcRenderer.invoke('export-cancel'),
  onExportProgress: cb => { ipcRenderer.removeAllListeners('export-progress'); ipcRenderer.on('export-progress', (e, p) => cb(p)); },
  showItem: p => ipcRenderer.invoke('show-item', p),
});
