// VIECUT cho Windows / Linux (Electron)
// Tác giả: Phạm Thành Long (thlong)
const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const engine = require('./engine');

// ---- ghi log ra %APPDATA%\VIECUT\viecut.log để dò lỗi ----
const LOG = () => path.join(app.getPath('userData'), 'viecut.log');
function log(...a) {
  try {
    fs.mkdirSync(app.getPath('userData'), { recursive: true });
    fs.appendFileSync(LOG(), `[${new Date().toISOString()}] ${a.join(' ')}\n`);
  } catch {}
}
process.on('uncaughtException', e => log('uncaughtException', (e && e.stack) || e));

// ---- tự tắt GPU nếu card đồ họa làm app bị văng (lỗi trắng màn hình rồi thoát) ----
const GPU_OFF = () => path.join(app.getPath('userData'), 'gpu-off');
let gpuOff = false;
try { gpuOff = fs.existsSync(GPU_OFF()) || process.argv.includes('--safe-mode'); } catch {}
if (gpuOff) {
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch('disable-gpu');
}
app.commandLine.appendSwitch('disable-gpu-sandbox');

// ---- chế độ tương thích: máy có phần mềm/driver làm tiến trình con không nạp được DLL (mã -1073741515) ----
const COMPAT = () => path.join(app.getPath('userData'), 'compat-mode');
let compat = false;
try { compat = fs.existsSync(COMPAT()) || process.argv.includes('--compat'); } catch {}
// Windows: luôn tắt sandbox của tiến trình con (một số máy có phần mềm/driver làm tiến trình con không nạp được DLL -> trắng màn hình).
// App chỉ mở file giao diện có sẵn trong máy, không mở trang web lạ, nên an toàn.
if (process.platform === 'win32') compat = true;
if (compat) {
  app.commandLine.appendSwitch('no-sandbox');
  app.commandLine.appendSwitch('in-process-gpu');
}
const DLL_NOT_FOUND = -1073741515;
function turnOnCompatAndRestart(reason) {
  if (compat) return false;
  log('Lỗi', reason, '-> bật chế độ tương thích (no-sandbox) và mở lại');
  try { fs.writeFileSync(COMPAT(), String(reason)); } catch {}
  app.relaunch(); app.exit(0); return true;
}

function turnOffGpuAndRestart(reason) {
  if (gpuOff) return;
  log('GPU lỗi:', reason, '-> chuyển sang chế độ không dùng GPU và mở lại');
  try { fs.writeFileSync(GPU_OFF(), String(reason || 'gpu')); } catch {}
  app.relaunch(); app.exit(0);
}

let win = null, reloads = 0;
function createWindow() {
  win = new BrowserWindow({
    width: 1400, height: 900, minWidth: 900, minHeight: 600,
    backgroundColor: '#f4f7ef', title: 'VIECUT', show: false,
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false,
      backgroundThrottling: false, // để xuất video không bị chậm khi thu nhỏ cửa sổ
      autoplayPolicy: 'no-user-gesture-required',
    },
  });
  Menu.setApplicationMenu(null);
  win.once('ready-to-show', () => win.show());
  setTimeout(() => { if (win && !win.isDestroyed() && !win.isVisible()) win.show(); }, 4000);
  win.loadFile(path.join(__dirname, '..', 'www', 'index.html')).catch(e => log('loadFile lỗi', e));
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && input.key === 'F12') win.webContents.toggleDevTools();
    if (input.type === 'keyDown' && input.key === 'F5') win.reload();
  });
  win.webContents.on('render-process-gone', (e, d) => {
    log('render-process-gone', d.reason, d.exitCode);
    if (d.exitCode === DLL_NOT_FOUND && turnOnCompatAndRestart('renderer ' + d.exitCode)) return;
    if (compat && !gpuOff && d.exitCode === DLL_NOT_FOUND) return turnOffGpuAndRestart('renderer ' + d.exitCode);
    if (d.reason !== 'clean-exit' && reloads++ < 3) setTimeout(() => win && !win.isDestroyed() && win.reload(), 500);
  });
  win.webContents.on('did-fail-load', (e, code, desc) => log('did-fail-load', code, desc));
  win.on('closed', () => { win = null; });
}

app.on('child-process-gone', (e, d) => {
  log('child-process-gone', d.type, d.reason, d.exitCode);
  if (d.exitCode === DLL_NOT_FOUND && turnOnCompatAndRestart(d.type + ' ' + d.exitCode)) return;
  if (d.type === 'GPU' && d.reason !== 'clean-exit') turnOffGpuAndRestart(d.reason);
});

ipcMain.handle('save-file', async (event, name, buffer) => {
  const w = BrowserWindow.fromWebContents(event.sender);
  const ext = path.extname(name).slice(1) || 'mp4';
  const { canceled, filePath } = await dialog.showSaveDialog(w, {
    title: 'Lưu video', defaultPath: path.join(app.getPath('videos'), name),
    filters: [{ name: 'Video', extensions: [ext] }],
  });
  if (canceled || !filePath) return null;
  await fs.promises.writeFile(filePath, Buffer.from(buffer));
  shell.showItemInFolder(filePath);
  return filePath;
});


// ---- lõi dựng video FFmpeg ----
const TMP = () => { const d = path.join(os.tmpdir(), 'viecut'); fs.mkdirSync(d, { recursive: true }); return d; };
ipcMain.handle('write-temp', async (e, name, buffer) => {
  const safe = String(name || 'file').replace(/[^\w.\-]+/g, '_').slice(-80);
  const f = path.join(TMP(), Date.now().toString(36) + Math.random().toString(36).slice(2, 6) + '-' + safe);
  await fs.promises.writeFile(f, Buffer.from(buffer)); return f;
});
ipcMain.handle('existing', (e, paths) => (paths || []).map(p => { try { return !!p && fs.statSync(p).isFile(); } catch { return false; } }));
ipcMain.handle('choose-save', async (event, name) => {
  const w = BrowserWindow.fromWebContents(event.sender);
  const { canceled, filePath } = await dialog.showSaveDialog(w, {
    title: 'Xuất video', defaultPath: path.join(app.getPath('videos'), name || 'video.mp4'),
    filters: [{ name: 'Video MP4', extensions: ['mp4'] }],
  });
  return canceled ? null : filePath;
});
let current = null;
ipcMain.handle('export-start', async (event, job) => {
  if (current) throw new Error('Đang xuất một video khác');
  const ff = engine.ffmpegPath(process.resourcesPath);
  log('Xuất video', job.outW + 'x' + job.outH, job.fps + 'fps', 'crf' + job.crf, job.duration + 's', '->', job.out, 'ffmpeg:', ff);
  const t0 = Date.now();
  current = engine.run(ff, job, p => { try { event.sender.send('export-progress', p); } catch {} }, log);
  try { const out = await current.promise; log('Xuất xong', ((Date.now() - t0) / 1000).toFixed(1) + 's'); return out; }
  finally {
    current = null;
    for (const f of job.tempFiles || []) fs.promises.unlink(f).catch(() => {});
  }
});
ipcMain.handle('export-cancel', () => { if (current) current.cancel(); });
ipcMain.handle('show-item', (e, p) => { shell.showItemInFolder(p); });
app.on('will-quit', () => { if (current) current.cancel(); try { fs.rmSync(TMP(), { recursive: true, force: true }); } catch {} });

// chỉ cho mở 1 cửa sổ VIECUT
if (!app.requestSingleInstanceLock()) { app.quit(); }
else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(() => {
    log('Khởi động VIECUT', app.getVersion(), process.platform, process.arch, gpuOff ? '(không dùng GPU)' : '', compat ? '(chế độ tương thích)' : '');
    createWindow();
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
}
