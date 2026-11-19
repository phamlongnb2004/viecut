// VIECUT cho Windows (Electron)
const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require('electron');
const path = require('path');
const fs = require('fs');

function createWindow() {
  const win = new BrowserWindow({
    width: 1400, height: 900, minWidth: 900, minHeight: 600,
    backgroundColor: '#0f1014', title: 'VIECUT',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false,
      backgroundThrottling: false, // để xuất video không bị chậm khi thu nhỏ cửa sổ
      autoplayPolicy: 'no-user-gesture-required',
    },
  });
  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, '..', 'www', 'index.html'));
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && input.key === 'F12') win.webContents.toggleDevTools();
    if (input.type === 'keyDown' && input.key === 'F5') win.reload();
  });
}

ipcMain.handle('save-file', async (event, name, buffer) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const ext = path.extname(name).slice(1) || 'mp4';
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: 'Lưu video', defaultPath: path.join(app.getPath('videos'), name),
    filters: [{ name: 'Video', extensions: [ext] }],
  });
  if (canceled || !filePath) return null;
  await fs.promises.writeFile(filePath, Buffer.from(buffer));
  shell.showItemInFolder(filePath);
  return filePath;
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
