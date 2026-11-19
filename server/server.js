// VIECUT server: tài khoản đăng nhập + lưu media + lưu project
// Tác giả: Phạm Thành Long (thlong)
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const DATA = process.env.DATA_DIR || path.join(__dirname, 'data');
const UPLOADS = path.join(DATA, 'uploads');
fs.mkdirSync(UPLOADS, { recursive: true });

// ---- secret cho JWT (tự tạo 1 lần, lưu lại) ----
const SECRET_FILE = path.join(DATA, 'secret.key');
const SECRET = process.env.JWT_SECRET || (fs.existsSync(SECRET_FILE)
  ? fs.readFileSync(SECRET_FILE, 'utf8')
  : (() => { const s = crypto.randomBytes(32).toString('hex'); fs.writeFileSync(SECRET_FILE, s); return s; })());

// ---- "database" JSON đơn giản ----
const DB_FILE = path.join(DATA, 'db.json');
let db = fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) : { users: [], media: [], projects: [] };
let saveTimer = null;
function saveDb() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fs.writeFileSync(DB_FILE + '.tmp', JSON.stringify(db));
    fs.renameSync(DB_FILE + '.tmp', DB_FILE);
  }, 200);
}
const uid = () => crypto.randomBytes(8).toString('hex');

const app = express();
// CORS: app Windows/Android/iOS gọi server từ origin riêng (file://, http://localhost, capacitor://)
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Range');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Accept-Ranges, Content-Length');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use(express.json({ limit: '5mb' }));
app.get('/api/health', (req, res) => res.json({ ok: true, users: db.users.length }));

// ---- trang tải app: /tai-app, link cố định /tai/windows /tai/android /tai/linux /tai/ios ----
// Đặt file vào server/downloads/ hoặc khai báo link ngoài (GitHub Releases…) bằng biến môi trường DL_WINDOWS, DL_ANDROID, DL_LINUX, DL_IOS
const DL_DIR = path.join(__dirname, 'downloads');
fs.mkdirSync(DL_DIR, { recursive: true });
const DL = {
  windows: { file: 'VIECUT-Setup.exe', name: 'Windows (bộ cài)', note: 'Chạy file, bấm Cài đặt. Nếu Windows báo SmartScreen: More info → Run anyway.' },
  'windows-portable': { file: 'VIECUT-Windows-portable.zip', name: 'Windows (không cần cài)', note: 'Giải nén rồi chạy VIECUT.exe.' },
  android: { file: 'VIECUT.apk', name: 'Android (APK)', note: 'Mở file, cho phép “Cài ứng dụng không rõ nguồn gốc”.' },
  linux: { file: 'VIECUT-Linux.tar.gz', name: 'Linux', note: 'Giải nén, chạy ./install.sh để thêm vào menu.' },
  ios: { file: 'VIECUT.ipa', name: 'iOS (thử nghiệm)', note: 'IPA chưa ký: cài bằng Sideloadly / AltStore với Apple ID phụ (ký lại sau 7 ngày).' },
};
const dlInfo = key => {
  const d = DL[key], env = process.env['DL_' + key.toUpperCase().replace('-', '_')];
  if (env) return { ...d, url: env };
  const p = path.join(DL_DIR, d.file);
  if (!fs.existsSync(p)) return null;
  const st = fs.statSync(p);
  return { ...d, url: '/downloads/' + encodeURIComponent(d.file), size: st.size, time: st.mtime };
};
app.use('/downloads', express.static(DL_DIR));
app.get('/tai/:os', (req, res) => { const d = DL[req.params.os] && dlInfo(req.params.os); d ? res.redirect(d.url) : res.status(404).send('Chưa có bản này'); });
app.get(['/', '/tai-app'], (req, res) => {
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const rows = Object.keys(DL).map(k => {
    const d = dlInfo(k); if (!d) return '';
    const meta = d.size ? `${(d.size / 1048576).toFixed(1)} MB · ${new Date(d.time).toLocaleString('vi-VN', { timeZone: 'Asia/Bangkok' })}` : '';
    return `<a class="dl" href="/tai/${k}"><b>${esc(d.name)}</b><span>${esc(meta)}</span><small>${esc(d.note)}</small></a>`;
  }).join('') || '<p>Chưa có bản tải nào. Đặt file vào thư mục server/downloads.</p>';
  res.send(`<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Tải VIECUT</title><style>
body{margin:0;background:#0f1014;color:#e9eaee;font-family:Montserrat,system-ui,sans-serif;display:flex;justify-content:center}
main{width:min(560px,92vw);padding:40px 0}h1{font-size:40px;margin:0}h1 b{color:#C1272C}p{color:#8b8e9a}
.dl{display:flex;flex-direction:column;gap:4px;background:#17181d;border:1px solid #2c2e37;border-radius:12px;padding:16px;margin:12px 0;color:inherit;text-decoration:none}
.dl:hover{border-color:#C1272C}.dl span,.dl small{color:#8b8e9a;font-size:13px}
</style></head><body><main><h1>VIE<b>CUT</b></h1><p>App edit video cho Windows, Android, iOS, Linux. Một tài khoản dùng trên mọi máy.</p>
<p>Địa chỉ server để đăng nhập: <b>${esc(req.protocol + '://' + req.get('host'))}</b></p>${rows}</main></body></html>`);
});

// ---- auth ----
function auth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : req.query.t; // ?t= dùng cho thẻ <video>
  try {
    const p = jwt.verify(token, SECRET);
    req.user = db.users.find(u => u.id === p.uid);
    if (!req.user) throw new Error();
    next();
  } catch { res.status(401).json({ error: 'Chưa đăng nhập' }); }
}
const sign = u => jwt.sign({ uid: u.id }, SECRET, { expiresIn: '30d' });
const pubUser = u => ({ id: u.id, username: u.username });

app.post('/api/register', async (req, res) => {
  const username = String(req.body.username || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  if (!/^[a-z0-9_.]{3,32}$/.test(username)) return res.status(400).json({ error: 'Tên đăng nhập 3–32 ký tự (chữ, số, _ .)' });
  if (password.length < 6) return res.status(400).json({ error: 'Mật khẩu tối thiểu 6 ký tự' });
  if (db.users.some(u => u.username === username)) return res.status(400).json({ error: 'Tên đăng nhập đã tồn tại' });
  const u = { id: uid(), username, hash: await bcrypt.hash(password, 10), created: Date.now() };
  db.users.push(u); saveDb();
  res.json({ token: sign(u), user: pubUser(u) });
});

app.post('/api/login', async (req, res) => {
  const username = String(req.body.username || '').trim().toLowerCase();
  const u = db.users.find(x => x.username === username);
  if (!u || !(await bcrypt.compare(String(req.body.password || ''), u.hash)))
    return res.status(400).json({ error: 'Sai tên đăng nhập hoặc mật khẩu' });
  res.json({ token: sign(u), user: pubUser(u) });
});

app.get('/api/me', auth, (req, res) => res.json(pubUser(req.user)));

// ---- media ----
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => { const d = path.join(UPLOADS, req.user.id); fs.mkdirSync(d, { recursive: true }); cb(null, d); },
    filename: (req, file, cb) => cb(null, uid() + path.extname(file.originalname).toLowerCase()),
  }),
  limits: { fileSize: 4 * 1024 * 1024 * 1024 },
});

app.get('/api/media', auth, (req, res) => {
  res.json(db.media.filter(m => m.owner === req.user.id).map(({ file, owner, ...m }) => m));
});

app.post('/api/media', auth, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Không có file' });
  const b = req.body;
  const m = {
    id: uid(), owner: req.user.id, file: req.file.filename,
    name: Buffer.from(req.file.originalname, 'latin1').toString('utf8'),
    kind: ['video', 'audio', 'image'].includes(b.kind) ? b.kind : 'video',
    duration: Number(b.duration) || 0, width: Number(b.width) || 0, height: Number(b.height) || 0,
    thumb: typeof b.thumb === 'string' && b.thumb.length < 200000 ? b.thumb : '',
    size: req.file.size, created: Date.now(),
  };
  db.media.push(m); saveDb();
  const { file, owner, ...out } = m; res.json(out);
});

app.get('/api/media/:id/file', auth, (req, res) => {
  const m = db.media.find(x => x.id === req.params.id && x.owner === req.user.id);
  if (!m) return res.status(404).end();
  res.sendFile(path.join(UPLOADS, req.user.id, m.file)); // hỗ trợ Range để tua video
});

app.delete('/api/media/:id', auth, (req, res) => {
  const i = db.media.findIndex(x => x.id === req.params.id && x.owner === req.user.id);
  if (i < 0) return res.status(404).end();
  fs.rm(path.join(UPLOADS, req.user.id, db.media[i].file), () => {});
  db.media.splice(i, 1); saveDb(); res.json({ ok: true });
});

// ---- projects ----
const mine = req => db.projects.find(p => p.id === req.params.id && p.owner === req.user.id);
app.get('/api/projects', auth, (req, res) => {
  res.json(db.projects.filter(p => p.owner === req.user.id)
    .map(p => ({ id: p.id, name: p.name, updated: p.updated, aspect: p.data?.aspect }))
    .sort((a, b) => b.updated - a.updated));
});
app.post('/api/projects', auth, (req, res) => {
  const p = { id: uid(), owner: req.user.id, name: String(req.body.name || 'Dự án mới').slice(0, 100),
    data: { aspect: req.body.aspect || '9:16', items: [] }, updated: Date.now() };
  db.projects.push(p); saveDb(); res.json(p);
});
app.get('/api/projects/:id', auth, (req, res) => { const p = mine(req); p ? res.json(p) : res.status(404).end(); });
app.put('/api/projects/:id', auth, (req, res) => {
  const p = mine(req); if (!p) return res.status(404).end();
  if (req.body.name !== undefined) p.name = String(req.body.name).slice(0, 100);
  if (req.body.data !== undefined) p.data = req.body.data;
  p.updated = Date.now(); saveDb(); res.json({ ok: true, updated: p.updated });
});
app.delete('/api/projects/:id', auth, (req, res) => {
  const i = db.projects.findIndex(p => p.id === req.params.id && p.owner === req.user.id);
  if (i < 0) return res.status(404).end();
  db.projects.splice(i, 1); saveDb(); res.json({ ok: true });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`VIECUT đang chạy: http://localhost:${PORT}`);
  const nets = require('os').networkInterfaces();
  for (const n of Object.values(nets).flat()) if (n.family === 'IPv4' && !n.internal)
    console.log(`  Máy khác cùng mạng mở: http://${n.address}:${PORT}`);
});
