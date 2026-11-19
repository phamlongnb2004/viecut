/* VIECUT – editor video kiểu CapCut (chạy trong app Windows / Android / iOS) */
'use strict';
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const LS = {
  get(k, d = '') { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};
const IS_NATIVE = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());

const FIXED_SERVER = (window.VIECUT_SERVER || '').replace(/\/+$/, '');
let SERVER = FIXED_SERVER || LS.get('srv', location.protocol.startsWith('http') && !IS_NATIVE ? location.origin : '');
let token = LS.get('tk');
let me = null;

function toast(msg, ms = 2500) {
  const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.add('hidden'), ms);
}
async function api(path, opt = {}) {
  opt.headers = Object.assign({}, opt.headers, token ? { Authorization: 'Bearer ' + token } : {});
  if (opt.json !== undefined) { opt.body = JSON.stringify(opt.json); opt.headers['Content-Type'] = 'application/json'; delete opt.json; }
  let r;
  try { r = await fetch(SERVER + path, opt); }
  catch { throw new Error('Không kết nối được server ' + SERVER); }
  const d = (r.headers.get('content-type') || '').includes('json') ? await r.json() : null;
  if (r.status === 401 && !path.startsWith('/api/login')) { logout(); throw new Error('Hết phiên đăng nhập'); }
  if (!r.ok) throw new Error((d && d.error) || r.statusText);
  return d;
}
function show(id) { $$('.screen').forEach(e => e.classList.add('hidden')); $('#' + id).classList.remove('hidden'); }
const fmt = t => { t = Math.max(0, t); const m = Math.floor(t / 60), s = t - m * 60; return String(m).padStart(2, '0') + ':' + s.toFixed(1).padStart(4, '0'); };
const uid = () => Math.random().toString(36).slice(2, 10);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/* ================= GIAO DIỆN SÁNG / TỐI ================= */
function applyTheme(t) {
  if (t === 'dark') document.documentElement.dataset.theme = 'dark'; else delete document.documentElement.dataset.theme;
  $$('.theme-btn').forEach(b => b.textContent = t === 'dark' ? '☀' : '🌙');
  $$('.theme-ic').forEach(b => b.textContent = t === 'dark' ? '☀️' : '🌙');
  $$('.theme-txt').forEach(b => b.textContent = t === 'dark' ? 'Giao diện sáng' : 'Giao diện tối');
}
applyTheme(LS.get('theme', 'light'));
$$('.theme-btn,.theme-row').forEach(b => b.addEventListener('click', e => {
  e.preventDefault();
  const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  LS.set('theme', t); applyTheme(t);
}));

/* ================= NƠI LƯU: TRÊN MÁY / ĐÁM MÂY ================= */
const Cloud = makeCloudStore({ api, server: () => SERVER, token: () => token });
let S = LocalStore;            // nơi lưu của dự án đang mở
let homeStore = 'local';       // tab đang xem ở trang chủ
const storeOf = k => k === 'cloud' ? Cloud : LocalStore;

/* ================= ĐĂNG NHẬP (không bắt buộc) ================= */
$('#asrv').value = SERVER;
if (FIXED_SERVER) { $('#asrv').classList.add('hidden'); $('#asrv').required = false; }
let authAct = 'login', afterLogin = null;
function openAuth(then) { afterLogin = then || null; $('#amsg').textContent = ''; $('#authModal').classList.remove('hidden'); setTimeout(() => $(FIXED_SERVER || !$('#asrv').value ? (FIXED_SERVER ? '#au' : '#asrv') : '#au').focus(), 50); }
function closeAuth() { $('#authModal').classList.add('hidden'); }
$('#authClose').onclick = closeAuth;
$('#authModal').addEventListener('pointerdown', e => { if (e.target.id === 'authModal') closeAuth(); });
$$('#authForm button[data-act]').forEach(b => b.addEventListener('click', () => authAct = b.dataset.act));
$('#authForm').addEventListener('submit', async e => {
  e.preventDefault();
  $('#amsg').textContent = '';
  const c2 = $('#ap2');
  if (authAct === 'register' && c2.classList.contains('hidden')) {
    c2.classList.remove('hidden'); c2.required = true; c2.focus();
    $('#amsg').textContent = 'Nhập lại mật khẩu rồi bấm Đăng ký lần nữa'; return;
  }
  if (authAct === 'login') { c2.classList.add('hidden'); c2.required = false; }
  if (authAct === 'register' && c2.value !== $('#ap').value) { $('#amsg').textContent = 'Hai mật khẩu không khớp'; return; }
  if (!FIXED_SERVER) {
    SERVER = $('#asrv').value.trim().replace(/\/+$/, '');
    if (!/^https?:\/\//.test(SERVER)) SERVER = 'http://' + SERVER;
    LS.set('srv', SERVER);
  }
  try {
    const d = await api('/api/' + authAct, { method: 'POST', json: { username: $('#au').value, password: $('#ap').value } });
    token = d.token; LS.set('tk', token); me = d.user; closeAuth(); renderAcct();
    toast('Đã đăng nhập: ' + me.username);
    if (afterLogin) { const f = afterLogin; afterLogin = null; f(); } else renderHome();
  } catch (err) { $('#amsg').textContent = err.message; }
});
function logout() {
  token = ''; LS.del('tk'); me = null; renderAcct();
  if (homeStore === 'cloud') setHomeStore('local');
  if (!$('#editor').classList.contains('hidden') && S === Cloud) { P = null; openHome(); }
}

function renderAcct() {
  const a = $('#acct');
  if (me) {
    a.innerHTML = `<div class="ava">${me.username.slice(0, 1).toUpperCase()}</div><div class="who"><b></b><small>Đã đăng nhập · đồng bộ đám mây</small></div><button class="btn icon" id="logoutBtn" title="Đăng xuất">⎋</button>`;
    a.querySelector('b').textContent = me.username;
    $('#logoutBtn').onclick = logout;
  } else {
    a.innerHTML = `<div class="ava guest">👤</div><div class="who"><b>Khách</b><small>Dự án lưu trên máy này</small></div><button class="btn primary sm" id="loginBtn">Đăng nhập</button>`;
    $('#loginBtn').onclick = () => openAuth();
  }
}

/* ================= TRANG CHỦ ================= */
function openHome() { show('home'); renderAcct(); renderHome(); }
function setHomeStore(k) {
  homeStore = k;
  $$('.nav-i[data-store]').forEach(b => b.classList.toggle('on', b.dataset.store === k));
  $('#projTitle').textContent = k === 'cloud' ? 'Dự án trên đám mây' : 'Dự án trên máy này';
  renderHome();
}
$$('.nav-i[data-store]').forEach(b => b.onclick = () => setHomeStore(b.dataset.store));
$('#projSearch').oninput = () => renderHome(true);
let homeCache = [];
async function renderHome(fromCache) {
  const list = $('#projList');
  if (homeStore === 'cloud' && !me) {
    list.innerHTML = `<div class="empty"><div class="empty-ic">☁️</div><b>Đăng nhập để dùng đám mây</b><p>Dự án trên đám mây mở lại được trên mọi máy: Windows, Android, iOS.</p><button class="btn primary" id="emptyLogin">Đăng nhập</button></div>`;
    $('#emptyLogin').onclick = () => openAuth(); return;
  }
  if (!fromCache) {
    list.innerHTML = '<p class="muted">Đang tải…</p>';
    try { homeCache = await storeOf(homeStore).listProjects(); } catch (err) { list.innerHTML = ''; return toast(err.message); }
  }
  const q = $('#projSearch').value.trim().toLowerCase();
  const ps = homeCache.filter(p => !q || (p.name || '').toLowerCase().includes(q));
  list.innerHTML = ps.length ? '' : `<div class="empty"><div class="empty-ic">🎬</div><b>${q ? 'Không tìm thấy dự án' : 'Chưa có dự án nào'}</b><p>Bấm “Tạo dự án” ở trên để bắt đầu edit.</p></div>`;
  for (const p of ps) {
    const d = document.createElement('div'); d.className = 'proj';
    const ar = (p.aspect || '9:16').split(':');
    d.innerHTML = `<div class="pthumb">${p.thumb ? `<img src="${p.thumb}" alt="">` : '<span>🎬</span>'}<i class="badge">${p.aspect || ''}</i>${p.dur ? `<i class="dur">${fmt(p.dur).replace(/\.\d$/, '')}</i>` : ''}<button class="del" title="Xóa dự án">🗑</button></div>
      <div class="pname"></div><div class="muted small">${new Date(p.updated).toLocaleString('vi-VN')}</div>`;
    d.querySelector('.pname').textContent = p.name;
    d.onclick = () => openEditor(p.id, homeStore);
    const del = d.querySelector('.del');
    del.onclick = async ev => {
      ev.stopPropagation();
      if (del.dataset.confirm) { await storeOf(homeStore).deleteProject(p.id); renderHome(); }
      else { del.dataset.confirm = 1; del.textContent = 'Xóa?'; del.classList.add('warn'); setTimeout(() => { delete del.dataset.confirm; del.textContent = '🗑'; del.classList.remove('warn'); }, 2500); }
    };
    list.appendChild(d);
  }
}
async function newProject(aspect, files) {
  const st = storeOf(homeStore);
  if (homeStore === 'cloud' && !me) return openAuth(() => newProject(aspect, files));
  try {
    const p = await st.createProject({ name: 'Dự án ' + new Date().toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }), aspect: aspect || LS.get('lastAspect', '9:16') });
    LS.set('lastAspect', p.data.aspect);
    await openEditor(p.id, homeStore);
    if (files && files.length) await importFiles(files, true);
  } catch (err) { toast(err.message); }
}
$('#heroNew').onclick = () => newProject();
$$('.qcard[data-new]').forEach(b => b.onclick = () => newProject(b.dataset.new));
$('#quickFile').onchange = e => { const f = [...e.target.files]; e.target.value = ''; if (f.length) newProject(null, f); };

/* ================= EDITOR: STATE ================= */
const ASPECT = { '16:9': [1920, 1080], '4:3': [1440, 1080], '2.35:1': [2538, 1080], '2:1': [2160, 1080], '1.85:1': [1998, 1080],
  '9:16': [1080, 1920], '3:4': [1080, 1440], '5.8-inch': [1080, 2338], '1:1': [1080, 1080], '4:5': [1080, 1350] };
function dims(a) {
  a = a || (P && P.data.aspect) || '9:16';
  if (ASPECT[a]) return ASPECT[a];
  if (a === 'orig') { // theo video/ảnh đầu tiên
    const f = P && P.data.items.filter(i => i.mediaId && i.kind !== 'audio').sort((x, y) => x.start - y.start)[0];
    const m = f && mById(f.mediaId);
    if (m && m.width && m.height) { const k = 1080 / Math.min(m.width, m.height); return [Math.round(m.width * k / 2) * 2, Math.round(m.height * k / 2) * 2]; }
    return ASPECT['16:9'];
  }
  return ASPECT['9:16'];
}
/* trạng thái track: khóa / ẩn / tắt tiếng */
const trk = id => { P.data.tracks = P.data.tracks || {}; return P.data.tracks[id] = P.data.tracks[id] || {}; };
const hiddenItem = it => !!(P.data.tracks && P.data.tracks[trackOf(it)] && P.data.tracks[trackOf(it)].hide);
const mutedItem = it => !!(P.data.tracks && P.data.tracks[trackOf(it)] && P.data.tracks[trackOf(it)].mute);
const lockedItem = it => !!(P.data.tracks && P.data.tracks[trackOf(it)] && P.data.tracks[trackOf(it)].lock);
const TRACKS = [{ id: 'text', name: 'Chữ' }, { id: 'video', name: 'Video' }, { id: 'audio', name: 'Âm thanh' }];
const COLORS = ['#FFFFFF', '#000000', '#C1272C', '#152758'];
const FPS = 30;
let P = null, media = [], sel = null, time = 0, playing = false, zoom = 60;
let hist = [], fut = [], dirty = false, saveT = null;
const els = {};              // mediaId -> element
const cv = $('#cv'), ctx = cv.getContext('2d');
const textBoxes = new Map(); // itemId -> box trên canvas
const trackOf = it => it.kind === 'image' ? 'video' : it.kind;
const items = () => P.data.items;
const projDur = () => Math.max(0, ...items().map(i => i.start + i.dur));
const mById = id => media.find(m => m.id === id);
const mediaUrl = m => S.mediaUrl(m);

async function openEditor(id, storeKey) {
  try {
    S = storeOf(storeKey || 'local');
    const [p, ms] = await Promise.all([S.getProject(id), S.listMedia()]);
    if (!p) throw new Error('Không thấy dự án');
    P = p; P.data.items = P.data.items || []; media = ms;
  } catch (err) { return toast(err.message); }
  for (const k of Object.keys(els)) { const el = els[k]; if (el.pause) el.pause(); el.remove && el.remove(); delete els[k]; }
  $('#storeBadge').textContent = S.kind === 'cloud' ? '☁️ Đám mây' : '💻 Trên máy';
  sel = null; time = 0; hist = []; fut = [];
  $('#projName').value = P.name; $('#aspectSel').value = P.data.aspect;
  show('editor'); setCanvasSize(); setAssetTab('media'); renderAll(); setSave('Đã lưu');
}
$('#backBtn').onclick = async () => { setPlaying(false); await flushSave(); openHome(); };
$('#projName').onchange = () => { P.name = $('#projName').value || 'Dự án'; markDirty(true); };
$('#aspectSel').onchange = () => { pushHist(); P.data.aspect = $('#aspectSel').value; setCanvasSize(); markDirty(); };
function setCanvasSize() { const [w, h] = dims(); if (cv.width !== w) cv.width = w; if (cv.height !== h) cv.height = h; }

/* ---- lưu tự động ---- */
function setSave(s) { $('#saveState').textContent = s === 'Đã lưu' ? '✓ Tự động lưu: ' + new Date().toLocaleTimeString('vi-VN') : s; }
function markDirty(nameOnly) {
  dirty = true; setSave('Đang lưu…'); renderAll();
  clearTimeout(saveT); saveT = setTimeout(flushSave, nameOnly ? 300 : 1200);
}
async function flushSave() {
  clearTimeout(saveT); if (!dirty || !P) return; dirty = false;
  const data = JSON.parse(JSON.stringify(P.data));
  const first = data.items.filter(i => i.mediaId && i.kind !== 'audio').sort((a, b) => a.start - b.start)[0];
  const fm = first && mById(first.mediaId);
  try { await S.saveProject(P.id, { name: P.name, data, thumb: (fm && fm.thumb) || '', dur: projDur() }); setSave('Đã lưu'); }
  catch (e) { dirty = true; setSave('Lỗi lưu – thử lại'); saveT = setTimeout(flushSave, 4000); }
}
window.addEventListener('beforeunload', () => { if (dirty) flushSave(); });

/* ---- undo / redo ---- */
function pushHist(snap) { hist.push(snap || JSON.stringify(P.data)); if (hist.length > 150) hist.shift(); fut = []; }
function undo() { if (!hist.length) return; fut.push(JSON.stringify(P.data)); P.data = JSON.parse(hist.pop()); afterHist(); }
function redo() { if (!fut.length) return; hist.push(JSON.stringify(P.data)); P.data = JSON.parse(fut.pop()); afterHist(); }
function afterHist() { if (sel && !items().find(i => i.id === sel)) sel = null; $('#aspectSel').value = P.data.aspect; setCanvasSize(); markDirty(); }
$('#undoBtn').onclick = undo; $('#redoBtn').onclick = redo;

/* ================= MEDIA ================= */
let assetTab = 'media', mediaFilter = 'all';
const SUBS = { media: [['all', 'Tất cả'], ['video', 'Video'], ['image', 'Ảnh']], audio: [['audio', 'Nhạc & âm thanh']], text: [['text', 'Mẫu chữ']] };
function setAssetTab(t) {
  assetTab = t;
  $$('.cat-i').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
  const body = (t === 'media' || t === 'audio') ? 'media' : t === 'text' ? 'text' : 'soon';
  $$('.tab-body').forEach(b => b.classList.toggle('hidden', b.id !== 'tab-' + body));
  if (t === 'audio') mediaFilter = 'audio'; else if (t === 'media') mediaFilter = 'all';
  const subs = SUBS[t] || [['soon', 'Sắp có']];
  $('#subNav').innerHTML = subs.map(([k, l], i) => `<button class="sub-i ${i === 0 ? 'on' : ''}" data-f="${k}">${l}</button>`).join('');
  $$('#subNav .sub-i').forEach(b => b.onclick = () => {
    $$('#subNav .sub-i').forEach(x => x.classList.toggle('on', x === b));
    if (t === 'media') { mediaFilter = b.dataset.f; renderMedia(); }
  });
  $('#fileIn').accept = t === 'audio' ? 'audio/*' : 'video/*,audio/*,image/*';
  if (body === 'media') renderMedia();
}
$$('.cat-i').forEach(b => b.onclick = () => setAssetTab(b.dataset.tab));
$('#mediaSearch').oninput = () => renderMedia();
function kindOf(file) {
  if (file.type.startsWith('image')) return 'image';
  if (file.type.startsWith('audio')) return 'audio';
  if (file.type.startsWith('video')) return 'video';
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac'].includes(ext)) return 'audio';
  if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) return 'image';
  return 'video';
}
function mkThumb(src, w, h) {
  const c = document.createElement('canvas'); const s = 160 / Math.max(w, h || 1);
  c.width = Math.max(1, Math.round(w * s)); c.height = Math.max(1, Math.round(h * s));
  try { c.getContext('2d').drawImage(src, 0, 0, c.width, c.height); return c.toDataURL('image/jpeg', 0.7); } catch { return ''; }
}
function probe(file) {
  return new Promise(res => {
    const kind = kindOf(file), url = URL.createObjectURL(file);
    let el = null, fin = false;
    const done = r => { if (fin) return; fin = true; if (el && el.pause) { el.pause(); el.removeAttribute('src'); el.load && el.load(); } setTimeout(() => URL.revokeObjectURL(url), 1000); res(Object.assign({ kind }, r)); };
    if (kind === 'image') {
      const im = new Image();
      im.onload = () => done({ duration: 5, width: im.naturalWidth, height: im.naturalHeight, thumb: mkThumb(im, im.naturalWidth, im.naturalHeight) });
      im.onerror = () => done({}); im.src = url; return;
    }
    el = document.createElement(kind); el.preload = 'metadata'; el.muted = true; el.playsInline = true; el.src = url;
    el.onerror = () => done({ duration: 0 });
    el.onloadedmetadata = () => {
      if (kind === 'audio') return done({ duration: el.duration });
      el.onseeked = () => done({ duration: el.duration, width: el.videoWidth, height: el.videoHeight, thumb: mkThumb(el, el.videoWidth, el.videoHeight) });
      el.currentTime = Math.min(0.5, el.duration / 2);
    };
    setTimeout(() => done({ duration: el.duration || 0 }), 15000);
  });
}
async function importFiles(files, toTimeline) {
  for (let i = 0; i < files.length; i++) {
    const f = files[i], tag = `(${i + 1}/${files.length}) ${f.name}`;
    $('#upProg').textContent = 'Đang đọc ' + tag;
    const meta = await probe(f);
    if (window.electronAPI && window.electronAPI.pathOf) meta.path = window.electronAPI.pathOf(f) || undefined;
    try {
      const m = await S.addMedia(f, meta, p => $('#upProg').textContent = `${S.kind === 'cloud' ? 'Tải lên' : 'Đang lưu'} ${tag}: ${Math.round(p * 100)}%`);
      media.push(m); renderMedia();
      if (toTimeline) addMedia(m);
    } catch (err) { toast(err.message); }
  }
  $('#upProg').textContent = '';
}
$('#fileIn').onchange = e => { const files = [...e.target.files]; e.target.value = ''; importFiles(files); };
function renderMedia() {
  const g = $('#mediaGrid'); g.innerHTML = '';
  const q = ($('#mediaSearch').value || '').trim().toLowerCase();
  const list = media.filter(m => (mediaFilter === 'all' || m.kind === mediaFilter) && (!q || (m.name || '').toLowerCase().includes(q)));
  if (!list.length) g.innerHTML = `<p class="muted small" style="grid-column:1/-1">${media.length ? 'Không có tệp phù hợp.' : 'Chưa có tệp. Bấm ＋ Nhập hoặc kéo file vào cửa sổ.'}</p>`;
  for (const m of [...list].reverse()) {
    const d = document.createElement('div'); d.className = 'media'; d.title = m.name;
    d.innerHTML = (m.thumb ? `<img src="${m.thumb}">` : `<div class="ph">${m.kind === 'audio' ? '♪' : '▶'}</div>`) +
      `<div class="meta"></div><span class="dur">${m.kind === 'image' ? 'Ảnh' : fmt(m.duration)}</span><button class="add" title="Thêm vào timeline">+</button><button class="rm" title="Xóa khỏi thư viện">×</button>`;
    d.querySelector('.meta').textContent = m.name;
    d.querySelector('.add').onclick = ev => { ev.stopPropagation(); addMedia(m); };
    d.ondblclick = () => addMedia(m);
    d.querySelector('.rm').onclick = async ev => {
      ev.stopPropagation();
      if (items().some(i => i.mediaId === m.id)) return toast('File đang dùng trong dự án, xóa clip trước');
      await S.deleteMedia(m.id); media = media.filter(x => x.id !== m.id); renderMedia();
    };
    g.appendChild(d);
  }
}
function trackEnd(tr) { return Math.max(0, ...items().filter(i => trackOf(i) === tr).map(i => i.start + i.dur)); }
function addMedia(m) {
  pushHist();
  const tr = m.kind === 'image' ? 'video' : m.kind;
  const it = { id: uid(), kind: m.kind, mediaId: m.id, start: tr === 'audio' ? time : trackEnd('video'), in: 0,
    dur: m.kind === 'image' ? 5 : Math.max(0.1, m.duration || 5), volume: 1, scale: 1, fit: 'contain', x: 0, y: 0 };
  items().push(it); sel = it.id; markDirty();
}

/* ================= CHỮ ================= */
const TEXT_PRESETS = {
  title: { text: 'Tiêu đề', size: 110, bold: true, color: '#FFFFFF', stroke: true, strokeColor: '#000000', bg: false, y: 0.25 },
  sub:   { text: 'Phụ đề ở đây', size: 64, bold: false, color: '#FFFFFF', stroke: true, strokeColor: '#000000', bg: false, y: 0.72 },
  red:   { text: 'NHẤN MẠNH', size: 96, bold: true, color: '#C1272C', stroke: true, strokeColor: '#FFFFFF', bg: false, y: 0.45 },
  box:   { text: 'Chữ có nền', size: 72, bold: true, color: '#FFFFFF', stroke: false, strokeColor: '#000000', bg: true, bgColor: '#152758', y: 0.5 },
};
function addText(preset = 'sub') {
  pushHist();
  const it = Object.assign({ id: uid(), kind: 'text', start: time, dur: 3, x: 0.5, strokeColor: '#000000', bgColor: '#152758' }, TEXT_PRESETS[preset]);
  items().push(it); sel = it.id; markDirty();
}
$('#addText').onclick = () => addText('sub');
$$('.preset').forEach(b => b.onclick = () => addText(b.dataset.preset));

/* ================= PHÁT / VẼ KHUNG HÌNH ================= */
let actx = null, dest = null; const gains = new Map();
function ensureAudio() {
  if (!actx) {
    actx = new (window.AudioContext || window.webkitAudioContext)();
    dest = actx.createMediaStreamDestination();
    Object.values(els).forEach(connectAudio);
  }
  if (actx.state === 'suspended') actx.resume();
}
function connectAudio(el) {
  if (!actx || !(el instanceof HTMLMediaElement) || gains.has(el)) return;
  try {
    const s = actx.createMediaElementSource(el), g = actx.createGain();
    s.connect(g); g.connect(actx.destination); g.connect(dest); gains.set(el, g);
  } catch (e) { console.warn(e); }
}
function getEl(mid) {
  if (els[mid]) return els[mid];
  const m = mById(mid); if (!m) return null;
  let el;
  if (m.kind === 'image') { el = new Image(); el.crossOrigin = 'anonymous'; el.src = mediaUrl(m); }
  else {
    el = document.createElement(m.kind === 'audio' ? 'audio' : 'video');
    el.crossOrigin = 'anonymous'; el.preload = 'auto'; el.playsInline = true; el.setAttribute('playsinline', '');
    el.src = mediaUrl(m); $('#mediaPool').appendChild(el);
  }
  els[mid] = el; connectAudio(el); return el;
}
function syncMedia(el, target, shouldPlay, vol) {
  const g = gains.get(el); if (g) g.gain.value = vol; else el.volume = clamp(vol, 0, 1);
  if (shouldPlay) {
    if (Math.abs(el.currentTime - target) > 0.25) el.currentTime = target;
    if (el.paused) el.play().catch(() => {});
  } else {
    if (!el.paused) el.pause();
    if (Math.abs(el.currentTime - target) > 0.03 && !el.seeking) el.currentTime = target;
  }
}
const mediaBoxes = new Map();
function fitBox(sw, sh, it, W, H) {
  const s = (it.fit === 'cover' ? Math.max(W / sw, H / sh) : Math.min(W / sw, H / sh)) * (it.scale || 1);
  return { cx: W / 2 + (it.x || 0) * W, cy: H / 2 + (it.y || 0) * H, w: sw * s, h: sh * s, rot: it.rot || 0 };
}
function drawFit(src, sw, sh, it, W, H) {
  if (!sw || !sh) return;
  const b = fitBox(sw, sh, it, W, H); mediaBoxes.set(it.id, b);
  ctx.save(); ctx.globalAlpha = it.opacity ?? 1; ctx.translate(b.cx, b.cy); ctx.rotate(b.rot * Math.PI / 180);
  ctx.drawImage(src, -b.w / 2, -b.h / 2, b.w, b.h); ctx.restore();
}
function roundRect(x, y, w, h, r, g = ctx) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
/* ---- hiệu ứng động của chữ ---- */
const ANIMS = {
  in: [['none', 'Không có'], ['fade', 'Mờ dần'], ['slideUp', 'Trượt lên'], ['slideDown', 'Trượt xuống'], ['slideLeft', 'Trượt trái'], ['slideRight', 'Trượt phải'],
    ['zoomIn', 'Phóng to'], ['zoomOut', 'Thu vào'], ['typewriter', 'Gõ chữ'], ['bounce', 'Nảy'], ['spin', 'Xoay vào']],
  out: [['none', 'Không có'], ['fade', 'Mờ dần'], ['slideUp', 'Trượt lên'], ['slideDown', 'Trượt xuống'], ['slideLeft', 'Trượt trái'], ['slideRight', 'Trượt phải'],
    ['zoomIn', 'Phóng ra'], ['zoomOut', 'Thu nhỏ'], ['typewriter', 'Xóa chữ'], ['bounce', 'Nảy'], ['spin', 'Xoay ra']],
  loop: [['none', 'Không có'], ['blink', 'Nhấp nháy'], ['shake', 'Rung lắc'], ['pulse', 'Nhịp đập'], ['float', 'Lơ lửng'], ['swing', 'Đung đưa']],
};
const easeOut = p => 1 - Math.pow(1 - p, 3);
const easeBack = p => { const c = 1.7; return 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2); };
function animDurs(it) {
  const A = it.anim || {}, half = it.dur / 2;
  return { inD: A.in && A.in.type !== 'none' ? Math.min(A.in.dur || 0.5, half) : 0, outD: A.out && A.out.type !== 'none' ? Math.min(A.out.dur || 0.5, half) : 0,
    loop: A.loop && A.loop.type !== 'none' ? (1 / (A.loop.speed || 1)) : 0 };
}
function animState(it, tl) {
  const st = { a: 1, dx: 0, dy: 0, sc: 1, rot: 0, frac: 1 }, A = it.anim || {}, d = animDurs(it);
  const apply = (type, p) => {
    const e = easeOut(p);
    if (type === 'fade') st.a *= e;
    else if (type === 'slideUp') { st.dy += (1 - e) * 0.12; st.a *= e; }
    else if (type === 'slideDown') { st.dy -= (1 - e) * 0.12; st.a *= e; }
    else if (type === 'slideLeft') { st.dx += (1 - e) * 0.25; st.a *= e; }
    else if (type === 'slideRight') { st.dx -= (1 - e) * 0.25; st.a *= e; }
    else if (type === 'zoomIn') { st.sc *= 0.3 + 0.7 * e; st.a *= e; }
    else if (type === 'zoomOut') { st.sc *= 1 + (1 - e) * 0.8; st.a *= e; }
    else if (type === 'typewriter') st.frac = Math.min(st.frac, p);
    else if (type === 'bounce') { st.sc *= Math.max(0, easeBack(p)); }
    else if (type === 'spin') { st.rot += (1 - e) * 180; st.sc *= 0.4 + 0.6 * e; st.a *= e; }
  };
  if (d.inD && tl < d.inD) apply(A.in.type, Math.max(0, tl / d.inD));
  if (d.outD && tl > it.dur - d.outD) apply(A.out.type, Math.max(0, (it.dur - tl) / d.outD));
  if (d.loop) {
    const ph = 2 * Math.PI * ((tl % d.loop) / d.loop), tp = A.loop.type;
    if (tp === 'blink') st.a *= 0.35 + 0.65 * (0.5 + 0.5 * Math.cos(ph));
    else if (tp === 'shake') st.dx += Math.sin(ph * 3) * 0.008;
    else if (tp === 'pulse') st.sc *= 1 + 0.07 * Math.sin(ph);
    else if (tp === 'float') st.dy += Math.sin(ph) * 0.012;
    else if (tp === 'swing') st.rot += Math.sin(ph) * 7;
  }
  return st;
}
function textCase(t, m) {
  if (m === 'upper') return t.toLocaleUpperCase('vi');
  if (m === 'lower') return t.toLocaleLowerCase('vi');
  if (m === 'title') return t.toLocaleLowerCase('vi').replace(/(^|\s)(\S)/g, (x, a, b) => a + b.toLocaleUpperCase('vi'));
  return t;
}
function drawText(it, W, H, g = ctx, tl = null) {
  const st = tl === null ? { a: 1, dx: 0, dy: 0, sc: 1, rot: 0, frac: 1 } : animState(it, tl);
  let lines = textCase(String(it.text || ''), it.caseMode).split('\n');
  if (st.frac < 1) { // gõ chữ: hiện dần từng ký tự
    let n = Math.floor(lines.join('').length * st.frac);
    lines = lines.map(l => { const c = l.slice(0, Math.max(0, n)); n -= l.length; return c; });
  }
  const size = it.size || 64, lh = size * (it.lineH || 1.22), fam = it.font || 'Montserrat';
  g.save();
  g.font = `${it.italic ? 'italic' : 'normal'} ${it.bold ? 800 : 500} ${size}px "${fam}", Montserrat, sans-serif`; // mặc định chữ đứng
  try { g.letterSpacing = (it.spacing || 0) + 'px'; } catch {}
  g.textBaseline = 'middle';
  const full = textCase(String(it.text || ''), it.caseMode).split('\n');
  const wMax = Math.max(...full.map(l => g.measureText(l).width), 10);
  const bw = wMax + size * 0.8, bh = full.length * lh + size * 0.4;
  const cx = it.x * W + st.dx * W, cy = it.y * H + st.dy * H, rot = (it.rot || 0) + st.rot;
  if (g === ctx) textBoxes.set(it.id, { cx: it.x * W, cy: it.y * H, w: bw, h: bh, rot: it.rot || 0 });
  g.globalAlpha = (it.opacity ?? 1) * st.a;
  g.translate(cx, cy); g.rotate(rot * Math.PI / 180); g.scale(st.sc, st.sc);
  const al = it.align || 'center', ax = al === 'left' ? -wMax / 2 : al === 'right' ? wMax / 2 : 0;
  g.textAlign = al;
  if (it.bg) { g.fillStyle = it.bgColor || '#152758'; roundRect(-bw / 2, -bh / 2, bw, bh, size * 0.25, g); g.fill(); }
  const top = -(full.length * lh) / 2;
  const shadow = () => { if (it.shadow) { g.shadowColor = it.shadowColor || 'rgba(0,0,0,.6)'; g.shadowBlur = it.shadowBlur ?? 12; g.shadowOffsetX = it.shadowX ?? 4; g.shadowOffsetY = it.shadowY ?? 6; } };
  const noShadow = () => { g.shadowColor = 'transparent'; g.shadowBlur = 0; g.shadowOffsetX = 0; g.shadowOffsetY = 0; };
  lines.forEach((l, i) => {
    const y = top + lh * (i + 0.5);
    if (it.stroke) { shadow(); g.lineWidth = size * (it.strokeW ?? 0.14); g.lineJoin = 'round'; g.strokeStyle = it.strokeColor || '#000'; g.strokeText(l, ax, y); noShadow(); }
    else shadow();
    g.fillStyle = it.color || '#fff'; g.fillText(l, ax, y); noShadow();
    if (it.underline && l) {
      const w = g.measureText(l).width, x0 = al === 'left' ? ax : al === 'right' ? ax - w : -w / 2;
      g.fillRect(x0, y + size * 0.45, w, Math.max(2, size * 0.06));
    }
  });
  g.restore();
}
function drawSafeZone(W, H) {
  if (P.data.aspect !== '9:16') return;
  // vùng an toàn TikTok (ước lượng trên khung 1080×1920)
  const s = W / 1080, x = 60 * s, y = 160 * s, w = W - 60 * s - 150 * s, h = H - 160 * s - 470 * s;
  ctx.save(); ctx.fillStyle = 'rgba(255,0,0,0.08)';
  ctx.fillRect(0, 0, W, y); ctx.fillRect(0, y + h, W, H - y - h); ctx.fillRect(0, y, x, h); ctx.fillRect(x + w, y, W - x - w, h);
  ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 3; ctx.setLineDash([14, 10]); ctx.strokeRect(x, y, w, h); ctx.restore();
}
function draw() {
  if (!P) return;
  const W = cv.width, H = cv.height, t = time;
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  const used = new Set(), act = i => t >= i.start && t < i.start + i.dur;
  mediaBoxes.clear(); setCanvasSize();
  const visual = items().filter(i => (i.kind === 'video' || i.kind === 'image') && act(i) && !hiddenItem(i)).sort((a, b) => a.start - b.start);
  for (const it of items()) {
    if ((it.kind === 'video' || it.kind === 'audio') && act(it)) {
      const el = getEl(it.mediaId); if (!el) continue;
      syncMedia(el, it.in + (t - it.start), playing, mutedItem(it) ? 0 : (it.volume ?? 1)); used.add(el);
    }
  }
  for (const it of visual) {
    const el = getEl(it.mediaId); if (!el) continue;
    if (it.kind === 'video' && el.readyState >= 2) drawFit(el, el.videoWidth, el.videoHeight, it, W, H);
    if (it.kind === 'image' && el.complete) drawFit(el, el.naturalWidth, el.naturalHeight, it, W, H);
  }
  // chuẩn bị trước clip sắp tới để chuyển cảnh mượt
  for (const it of items()) {
    if ((it.kind === 'video' || it.kind === 'audio') && it.start > t && it.start - t < 1.5) {
      const el = getEl(it.mediaId);
      if (el && !used.has(el) && !el.seeking && Math.abs(el.currentTime - it.in) > 0.1) { el.pause(); el.currentTime = it.in; }
      if (el) used.add(el);
    }
  }
  Object.values(els).forEach(el => { if (el instanceof HTMLMediaElement && !used.has(el) && !el.paused) el.pause(); });
  textBoxes.clear();
  items().filter(i => i.kind === 'text' && act(i) && !hiddenItem(i)).sort((a, b) => a.start - b.start).forEach(i => drawText(i, W, H, ctx, t - i.start));
  updateSelBox();
  if ($('#safeChk').checked && !exporting) drawSafeZone(W, H);
}
let lastTs = 0;
function frame(ts) {
  const dt = lastTs ? (ts - lastTs) / 1000 : 0; lastTs = ts;
  if (playing && P) {
    time += Math.min(dt, 0.1);
    const d = projDur();
    if (exporting) setExProg(time / d);
    if (time >= d) { time = d; setPlaying(false); if (exporting) finishExport(); }
  }
  if (P && !nativeBusy && !$('#editor').classList.contains('hidden')) { draw(); updatePlayhead(); }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
function setPlaying(v) {
  if (v) { ensureAudio(); if (time >= projDur() - 0.01) time = 0; }
  playing = v && projDur() > 0; $('#playBtn').textContent = playing ? '❚❚' : '▶';
}
$('#playBtn').onclick = () => setPlaying(!playing);
$('#stepBack').onclick = () => { setPlaying(false); time = Math.max(0, time - 1 / FPS); };
$('#stepFwd').onclick = () => { setPlaying(false); time = Math.min(projDur(), time + 1 / FPS); };
$('#safeChk').onchange = () => {};

/* ---- kéo chữ / video trên khung hình ---- */
function canvasPt(e) { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * cv.width / r.width, y: (e.clientY - r.top) * cv.height / r.height }; }
function inBox(p, b) { // điểm p có nằm trong hộp đã xoay b không
  const r = -(b.rot || 0) * Math.PI / 180, dx = p.x - b.cx, dy = p.y - b.cy;
  const x = dx * Math.cos(r) - dy * Math.sin(r), y = dx * Math.sin(r) + dy * Math.cos(r);
  return Math.abs(x) <= b.w / 2 && Math.abs(y) <= b.h / 2;
}
const boxOf = it => it && (it.kind === 'text' ? textBoxes.get(it.id) : mediaBoxes.get(it.id));
cv.addEventListener('pointerdown', e => {
  const p = canvasPt(e); let hit = null;
  const vis = items().filter(i => i.kind !== 'audio' && boxOf(i) && !hiddenItem(i)).sort((a, b) => (a.kind === 'text') - (b.kind === 'text') || a.start - b.start).reverse();
  hit = vis.find(i => inBox(p, boxOf(i)));
  if (!hit) { sel = null; renderAll(); return; }
  sel = hit.id; renderAll();
  if (lockedItem(hit)) return toast('Track đang khóa');
  const snap = JSON.stringify(P.data), ox = hit.x || 0, oy = hit.y || 0; let moved = false;
  cv.setPointerCapture(e.pointerId);
  const mv = ev => {
    const q = canvasPt(ev), dx = (q.x - p.x) / cv.width, dy = (q.y - p.y) / cv.height; moved = true;
    hit.x = ox + dx; hit.y = oy + dy;
    const cx0 = hit.kind === 'text' ? 0.5 : 0, cy0 = hit.kind === 'text' ? 0.5 : 0; // hít vào giữa
    if (Math.abs(hit.x - cx0) < 0.015) hit.x = cx0; if (Math.abs(hit.y - cy0) < 0.015) hit.y = cy0;
  };
  const up = () => { cv.removeEventListener('pointermove', mv); cv.removeEventListener('pointerup', up); if (moved) { pushHist(snap); markDirty(); } };
  cv.addEventListener('pointermove', mv); cv.addEventListener('pointerup', up);
});

/* ---- khung chọn trên trình phát: kéo góc để phóng to, nút tròn để xoay, ✕ để xóa ---- */
const selBox = document.createElement('div'); selBox.className = 'selbox hidden';
selBox.innerHTML = '<i class="h tl"></i><i class="h tr"></i><i class="h bl"></i><i class="h br"></i><i class="rot" title="Kéo để xoay"></i><b class="x" title="Xóa">✕</b>';
$('#stage').style.position = 'relative'; $('#stage').appendChild(selBox);
function updateSelBox() {
  const it = selItem(), b = boxOf(it);
  if (!it || !b || exporting || hiddenItem(it) || time < it.start || time >= it.start + it.dur) { selBox.classList.add('hidden'); return; }
  const r = cv.getBoundingClientRect(), sr = $('#stage').getBoundingClientRect(), k = r.width / cv.width;
  selBox.classList.remove('hidden');
  Object.assign(selBox.style, { left: (r.left - sr.left + b.cx * k) + 'px', top: (r.top - sr.top + b.cy * k) + 'px', width: b.w * k + 'px', height: b.h * k + 'px',
    transform: `translate(-50%,-50%) rotate(${b.rot || 0}deg)` });
}
selBox.querySelector('.x').onclick = e => { e.stopPropagation(); del(); };
selBox.addEventListener('pointerdown', e => {
  const it = selItem(), b = boxOf(it); if (!it || !b) return;
  const h = e.target; if (!h.classList.contains('h') && !h.classList.contains('rot')) { // bấm giữa khung = kéo như trên canvas
    cv.dispatchEvent(new PointerEvent('pointerdown', { clientX: e.clientX, clientY: e.clientY, pointerId: e.pointerId, bubbles: true })); return; }
  e.preventDefault(); e.stopPropagation();
  if (lockedItem(it)) return toast('Track đang khóa');
  const snap = JSON.stringify(P.data), c = { x: b.cx, y: b.cy }, p0 = canvasPt(e);
  const d0 = Math.hypot(p0.x - c.x, p0.y - c.y) || 1, a0 = Math.atan2(p0.y - c.y, p0.x - c.x), rot0 = it.rot || 0;
  const size0 = it.size || 64, scale0 = it.scale || 1, isRot = h.classList.contains('rot');
  selBox.setPointerCapture(e.pointerId);
  const mv = ev => {
    const q = canvasPt(ev);
    if (isRot) { let r = rot0 + (Math.atan2(q.y - c.y, q.x - c.x) - a0) * 180 / Math.PI; r = ((r + 540) % 360) - 180; if (Math.abs(r) < 3) r = 0; if (Math.abs(Math.abs(r) - 90) < 3) r = Math.sign(r) * 90; it.rot = Math.round(r); }
    else { const f = Math.max(0.05, Math.hypot(q.x - c.x, q.y - c.y) / d0); if (it.kind === 'text') it.size = Math.round(clamp(size0 * f, 8, 600)); else it.scale = +clamp(scale0 * f, 0.05, 10).toFixed(3); }
  };
  const up = () => { selBox.removeEventListener('pointermove', mv); selBox.removeEventListener('pointerup', up); pushHist(snap); $('#props').dataset.for = ''; markDirty(); };
  selBox.addEventListener('pointermove', mv); selBox.addEventListener('pointerup', up);
});

/* ================= TIMELINE ================= */
function renderTrackHeads() {
  if (!P) return;
  $('#tlLabels').innerHTML = TRACKS.map(t => { const s = trk(t.id); return `<div class="th" data-t="${t.id}"><span class="tn">${t.name}</span><span class="tb">
    <button class="${s.lock ? 'on' : ''}" data-a="lock" title="${s.lock ? 'Mở khóa' : 'Khóa'} track">${s.lock ? '🔒' : '🔓'}</button>
    <button class="${s.hide ? 'on' : ''}" data-a="hide" title="${s.hide ? 'Hiện' : 'Ẩn'} track">${s.hide ? '🙈' : '👁'}</button>
    ${t.id !== 'text' ? `<button class="${s.mute ? 'on' : ''}" data-a="mute" title="${s.mute ? 'Bật' : 'Tắt'} tiếng">${s.mute ? '🔇' : '🔊'}</button>` : ''}</span></div>`; }).join('');
  $$('#tlLabels button').forEach(b => b.onclick = () => { pushHist(); const s = trk(b.closest('.th').dataset.t); s[b.dataset.a] = !s[b.dataset.a]; markDirty(); });
}
$('#zoom').oninput = e => { zoom = +e.target.value; renderTimeline(); };
$('#zoomIn').onclick = () => { zoom = Math.min(300, Math.round(zoom * 1.25)); $('#zoom').value = zoom; renderTimeline(); };
$('#zoomOut').onclick = () => { zoom = Math.max(10, Math.round(zoom / 1.25)); $('#zoom').value = zoom; renderTimeline(); };
function renderAll() { renderTrackHeads(); renderTimeline(); renderProps(); $('#undoBtn').disabled = !hist.length; $('#redoBtn').disabled = !fut.length; }
function renderTimeline() {
  if (!P) return;
  const total = Math.max(projDur() + 15, 30), W = total * zoom;
  $('#tlContent').style.width = W + 'px';
  const steps = [0.5, 1, 2, 5, 10, 15, 30, 60, 120], step = steps.find(s => s * zoom >= 70) || 300;
  let rh = ''; for (let t = 0; t <= total; t += step) rh += `<div class="tick" style="left:${t * zoom}px">${fmt(t).replace(/\.\d$/, '')}</div>`;
  $('#ruler').innerHTML = rh;
  const tracks = $('#tracks'); tracks.innerHTML = '';
  for (const tr of TRACKS) {
    const row = document.createElement('div'); row.className = 'track'; row.dataset.track = tr.id;
    for (const it of items().filter(i => trackOf(i) === tr.id)) {
      const c = document.createElement('div'); c.className = `clip ${it.kind}${it.id === sel ? ' sel' : ''}${hiddenItem(it) ? ' off' : ''}`; c.dataset.id = it.id;
      c.style.left = it.start * zoom + 'px'; c.style.width = Math.max(8, it.dur * zoom) + 'px';
      const m = it.mediaId && mById(it.mediaId);
      if (m && m.thumb) c.style.backgroundImage = `url(${m.thumb})`;
      const label = document.createElement('span'); label.textContent = it.kind === 'text' ? (it.text || '').replace(/\n/g, ' ') : (m ? m.name : 'Thiếu file');
      c.append(label);
      c.insertAdjacentHTML('beforeend', '<div class="h l"></div><div class="h r"></div>');
      row.appendChild(c);
    }
    tracks.appendChild(row);
  }
  $('#tdur').textContent = fmt(projDur());
  $('#tlEmpty').classList.toggle('hidden', items().length > 0);
}
function updatePlayhead() { $('#playhead').style.left = time * zoom + 'px'; $('#tcur').textContent = fmt(time); }
function snapPoints(exceptId) { const pts = [0, time]; for (const i of items()) if (i.id !== exceptId) pts.push(i.start, i.start + i.dur); return pts; }
function snap(v, pts) { const th = 8 / zoom; for (const p of pts) if (Math.abs(v - p) < th) return p; return v; }

$('#tlContent').addEventListener('pointerdown', e => {
  const clip = e.target.closest('.clip');
  if (!clip) { // bấm vùng trống/thước: tua
    const seek = ev => { const r = $('#tlContent').getBoundingClientRect(); time = clamp((ev.clientX - r.left) / zoom, 0, projDur()); };
    setPlaying(false); seek(e);
    if (e.target.closest('.track')) { sel = null; renderAll(); }
    const up = () => { removeEventListener('pointermove', seek); removeEventListener('pointerup', up); };
    addEventListener('pointermove', seek); addEventListener('pointerup', up); return;
  }
  const it = items().find(i => i.id === clip.dataset.id); if (!it) return;
  if (lockedItem(it)) { sel = it.id; renderAll(); return toast('Track đang khóa'); }
  if (sel !== it.id) { sel = it.id; renderProps(); $$('.clip').forEach(c => c.classList.toggle('sel', c === clip)); }
  const mode = e.target.classList.contains('l') ? 'l' : e.target.classList.contains('r') ? 'r' : 'move';
  const snapStr = JSON.stringify(P.data), o = { ...it }, x0 = e.clientX, pts = snapPoints(it.id);
  const m = it.mediaId && mById(it.mediaId), maxSrc = it.kind === 'video' || it.kind === 'audio' ? (m?.duration || Infinity) : Infinity;
  let moved = false; clip.setPointerCapture(e.pointerId);
  const mv = ev => {
    const dx = (ev.clientX - x0) / zoom; if (Math.abs(ev.clientX - x0) > 2) moved = true; if (!moved) return;
    if (mode === 'move') {
      let s = Math.max(0, o.start + dx); const se = snap(s + o.dur, pts); s = snap(s, pts);
      if (s === Math.max(0, o.start + dx) && se !== s + o.dur) s = se - o.dur;
      it.start = Math.max(0, s);
    } else if (mode === 'l') {
      const minStart = it.kind === 'video' || it.kind === 'audio' ? Math.max(0, o.start - o.in) : 0;
      const ns = clamp(snap(o.start + dx, pts), minStart, o.start + o.dur - 0.1), d = ns - o.start;
      it.start = ns; it.in = (o.in || 0) + d; it.dur = o.dur - d;
    } else {
      it.dur = clamp(snap(o.start + o.dur + dx, pts) - o.start, 0.1, maxSrc - (o.in || 0));
    }
    clip.style.left = it.start * zoom + 'px'; clip.style.width = Math.max(8, it.dur * zoom) + 'px';
  };
  const up = () => { clip.removeEventListener('pointermove', mv); clip.removeEventListener('pointerup', up); if (moved) { pushHist(snapStr); markDirty(); } };
  clip.addEventListener('pointermove', mv); clip.addEventListener('pointerup', up);
});

/* ---- công cụ ---- */
function selItem() { return items().find(i => i.id === sel); }
function split() {
  const it = selItem(); if (!it) return toast('Chọn một clip trước');
  if (time <= it.start + 0.05 || time >= it.start + it.dur - 0.05) return toast('Đặt con trỏ thời gian vào giữa clip');
  pushHist();
  const a = time - it.start, b = { ...it, id: uid(), start: time, in: (it.in || 0) + a, dur: it.dur - a };
  it.dur = a; items().push(b); sel = b.id; markDirty();
}
function del() { const it = selItem(); if (!it) return; pushHist(); P.data.items = items().filter(i => i.id !== it.id); sel = null; markDirty(); }
function dup() { const it = selItem(); if (!it) return; pushHist(); const b = { ...it, id: uid(), start: trackEnd(trackOf(it)) }; items().push(b); sel = b.id; markDirty(); }
$('#splitBtn').onclick = split; $('#delBtn').onclick = del; $('#dupBtn').onclick = dup;
addEventListener('keydown', e => {
  if ($('#editor').classList.contains('hidden') || /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
  const k = e.key.toLowerCase();
  if (k === ' ') { e.preventDefault(); setPlaying(!playing); }
  else if (k === 's' && !e.ctrlKey) split();
  else if (k === 'delete' || k === 'backspace') del();
  else if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
  else if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); redo(); }
  else if (k === 'arrowleft') $('#stepBack').click();
  else if (k === 'arrowright') $('#stepFwd').click();
});

/* ================= KÉO THẢ FILE ================= */
let dragN = 0;
const isFiles = e => e.dataTransfer && [...(e.dataTransfer.types || [])].includes('Files');
addEventListener('dragenter', e => { if ($('#editor').classList.contains('hidden') || !isFiles(e)) return; e.preventDefault(); dragN++; $('#dropVeil').classList.remove('hidden'); });
addEventListener('dragleave', e => { if (!isFiles(e)) return; if (--dragN <= 0) { dragN = 0; $('#dropVeil').classList.add('hidden'); } });
addEventListener('dragover', e => { if (isFiles(e)) e.preventDefault(); });
addEventListener('drop', e => {
  if (!isFiles(e)) return; e.preventDefault(); dragN = 0; $('#dropVeil').classList.add('hidden');
  if ($('#editor').classList.contains('hidden')) return;
  const files = [...e.dataTransfer.files].filter(f => /^(video|audio|image)\//.test(f.type) || /\.(mp4|mov|mkv|webm|avi|mp3|wav|m4a|aac|ogg|flac|png|jpe?g|webp|gif)$/i.test(f.name));
  if (!files.length) return toast('Chỉ nhận video, ảnh hoặc nhạc');
  const onTimeline = !!document.elementFromPoint(e.clientX, e.clientY)?.closest('#timeline');
  importFiles(files, onTimeline);
});

/* ================= BẢNG THUỘC TÍNH ================= */
let propTab = 'text', propSub = 'basic', animSub = 'in';
function slider(label, key, min, max, step, val, unit = '') {
  return `<div class="prop"><label>${label}<span class="numw"><input type="number" class="num" data-k="${key}" data-num min="${min}" max="${max}" step="${step}" value="${val}">${unit}</span></label>
    <input type="range" data-k="${key}" data-num min="${min}" max="${max}" step="${step}" value="${val}"></div>`;
}
const segBtns = (key, cur, opts) => `<div class="seg">${opts.map(([v, l, t]) => `<button class="btn ${String(cur) === String(v) ? 'on' : ''}" data-set="${key}" data-v="${v}" title="${t || ''}">${l}</button>`).join('')}</div>`;
function renderProps() {
  const box = $('#props'), it = selItem();
  if (!it) { box.dataset.for = ''; box.innerHTML = '<div class="props-empty"><div class="empty-ic">👆</div><b>Chưa chọn gì</b><p class="muted small">Bấm một clip trên timeline hoặc trên khung hình để chỉnh.</p><p class="muted small">Space phát/dừng · S tách · Delete xóa · Ctrl+Z hoàn tác</p></div>'; return; }
  if (box.dataset.for === it.id && box.contains(document.activeElement) && document.activeElement !== document.body && document.activeElement.tagName !== 'BUTTON') return; // đang gõ
  box.dataset.for = it.id;
  let h = '';
  if (it.kind === 'text') {
    if (!['text', 'anim'].includes(propTab)) propTab = 'text';
    h += `<div class="ptabs"><button class="${propTab === 'text' ? 'on' : ''}" data-ptab="text">Văn bản</button><button class="${propTab === 'anim' ? 'on' : ''}" data-ptab="anim">Hiệu ứng động</button></div>`;
    if (propTab === 'text') {
      h += `<div class="psub"><button class="${propSub === 'basic' ? 'on' : ''}" data-psub="basic">Cơ bản</button><button class="${propSub === 'shadow' ? 'on' : ''}" data-psub="shadow">Bóng đổ</button><button class="${propSub === 'more' ? 'on' : ''}" data-psub="more">Nâng cao</button></div>`;
      if (propSub === 'basic') {
        h += `<div class="prop"><textarea data-k="text" rows="3" placeholder="Nhập chữ…"></textarea></div>
        <div class="prop row2"><label>Phông chữ</label><div class="font-pick"><button class="btn font-cur" data-fontbtn style="font-family:'${it.font || 'Montserrat'}'"><span>${it.font || 'Montserrat'}</span><i>▾</i></button></div></div>
        <div class="font-pop hidden" data-fontpop></div>
        ${slider('Cỡ chữ', 'size', 8, 400, 1, it.size || 64)}
        <div class="prop row2"><label>Hoa văn</label><div class="seg icons">
          <button class="btn ${it.bold ? 'on' : ''}" data-toggle="bold" title="Đậm"><b>B</b></button>
          <button class="btn ${it.underline ? 'on' : ''}" data-toggle="underline" title="Gạch chân"><u>U</u></button>
          <button class="btn ${it.italic ? 'on' : ''}" data-toggle="italic" title="Nghiêng"><i>I</i></button></div></div>
        <div class="prop row2"><label>Chữ hoa/thường</label>${segBtns('caseMode', it.caseMode || 'none', [['none', 'Aa', 'Giữ nguyên'], ['upper', 'TT', 'IN HOA'], ['lower', 'tt', 'in thường'], ['title', 'Tt', 'Hoa Đầu Từ']])}</div>
        <div class="prop row2"><label>Căn lề</label>${segBtns('align', it.align || 'center', [['left', '⯇≡', 'Căn trái'], ['center', '≡', 'Căn giữa'], ['right', '≡⯈', 'Căn phải']])}</div>
        <div class="prop"><label>Màu chữ</label>${colorCtl('color', it.color)}</div>
        ${slider('Độ mờ', 'opacity', 0, 1, 0.01, it.opacity ?? 1)}
        <div class="prop row2"><label>Viền chữ</label><label class="switch"><input type="checkbox" data-check="stroke" ${it.stroke ? 'checked' : ''}><span></span></label></div>
        ${it.stroke ? `<div class="prop sub-prop"><label>Màu viền</label>${colorCtl('strokeColor', it.strokeColor)}</div>${slider('Độ dày viền', 'strokeW', 0.02, 0.4, 0.01, it.strokeW ?? 0.14)}` : ''}
        <div class="prop row2"><label>Nền chữ</label><label class="switch"><input type="checkbox" data-check="bg" ${it.bg ? 'checked' : ''}><span></span></label></div>
        ${it.bg ? `<div class="prop sub-prop"><label>Màu nền</label>${colorCtl('bgColor', it.bgColor)}</div>` : ''}
        <div class="prop row2"><label>Vị trí nhanh</label><div class="seg"><button class="btn" data-pos="0.2">Trên</button><button class="btn" data-pos="0.5">Giữa</button><button class="btn" data-pos="0.72">Dưới</button></div></div>`;
      } else if (propSub === 'shadow') {
        h += `<div class="prop row2"><label>Bóng đổ</label><label class="switch"><input type="checkbox" data-check="shadow" ${it.shadow ? 'checked' : ''}><span></span></label></div>
        ${it.shadow ? `<div class="prop"><label>Màu bóng</label>${colorCtl('shadowColor', it.shadowColor || '#000000')}</div>
          ${slider('Độ nhòe', 'shadowBlur', 0, 60, 1, it.shadowBlur ?? 12)}${slider('Lệch ngang', 'shadowX', -40, 40, 1, it.shadowX ?? 4)}${slider('Lệch dọc', 'shadowY', -40, 40, 1, it.shadowY ?? 6)}` : '<p class="muted small">Bật bóng đổ để chữ nổi bật trên nền sáng.</p>'}`;
      } else {
        h += `${slider('Giãn chữ', 'spacing', -10, 60, 1, it.spacing || 0, 'px')}${slider('Giãn dòng', 'lineH', 0.8, 2.5, 0.02, it.lineH || 1.22)}${slider('Xoay', 'rot', -180, 180, 1, it.rot || 0, '°')}`;
      }
    } else {
      const A = it.anim || {}, cur = (A[animSub] && A[animSub].type) || 'none';
      h += `<div class="psub"><button class="${animSub === 'in' ? 'on' : ''}" data-asub="in">Vào</button><button class="${animSub === 'out' ? 'on' : ''}" data-asub="out">Ra</button><button class="${animSub === 'loop' ? 'on' : ''}" data-asub="loop">Vòng lặp</button></div>
        <div class="anim-grid">${ANIMS[animSub].map(([v, l]) => `<button class="anim-c ${cur === v ? 'on' : ''}" data-anim="${v}"><span class="anim-demo an-${animSub}-${v}">${v === 'none' ? '⊘' : 'ABC'}</span><small>${l}</small></button>`).join('')}</div>
        ${cur !== 'none' ? (animSub === 'loop' ? slider('Tốc độ', 'anim.loop.speed', 0.25, 4, 0.05, (A.loop && A.loop.speed) || 1, '×') : slider('Thời lượng', `anim.${animSub}.dur`, 0.1, 3, 0.05, (A[animSub] && A[animSub].dur) || 0.5, 's')) : ''}`;
    }
  }
  if (it.kind === 'video' || it.kind === 'image') {
    h += `<div class="ptabs"><button class="on">${it.kind === 'video' ? 'Video' : 'Ảnh'}</button></div>
      ${slider('Thu phóng', 'scale', 0.05, 5, 0.01, it.scale || 1, '×')}
      <div class="prop row2"><label>Khung</label>${segBtns('fit', it.fit || 'contain', [['contain', 'Vừa khung'], ['cover', 'Lấp đầy']])}</div>
      ${slider('Xoay', 'rot', -180, 180, 1, it.rot || 0, '°')}${slider('Độ mờ', 'opacity', 0, 1, 0.01, it.opacity ?? 1)}
      <div class="prop"><button class="btn block" data-reset>↺ Đặt lại vị trí, cỡ, góc xoay</button></div>`;
  }
  if (it.kind === 'video' || it.kind === 'audio') h += `${it.kind === 'audio' ? '<div class="ptabs"><button class="on">Âm thanh</button></div>' : ''}${slider('Âm lượng', 'volume', 0, 2, 0.01, it.volume ?? 1, '×')}`;
  h += `<div class="ptime muted small">Bắt đầu ${fmt(it.start)} · Dài ${it.dur.toFixed(2)} giây</div><div class="prop"><button class="btn danger block" data-del>🗑 Xóa clip</button></div>`;
  box.innerHTML = h;
  const ta = box.querySelector('textarea'); if (ta) ta.value = it.text;
  const getK = k => k.split('.').reduce((o, p) => o && o[p], it);
  const setK = (k, v) => { const ps = k.split('.'); let o = it; for (let i = 0; i < ps.length - 1; i++) o = o[ps[i]] = o[ps[i]] || {}; o[ps[ps.length - 1]] = v; };
  let pre = null;
  box.querySelectorAll('[data-k]').forEach(inp => {
    inp.addEventListener('focus', () => pre = JSON.stringify(P.data));
    inp.addEventListener('pointerdown', () => pre = pre || JSON.stringify(P.data));
    inp.addEventListener('input', () => {
      const k = inp.dataset.k; let v = inp.dataset.num !== undefined ? +inp.value : inp.value;
      if (inp.dataset.num !== undefined && isNaN(v)) return;
      setK(k, v);
      box.querySelectorAll(`[data-k="${k}"]`).forEach(o => { if (o !== inp) o.value = v; });
      dirty = true; setSave('Đang lưu…'); clearTimeout(saveT); saveT = setTimeout(flushSave, 1200);
      if (k === 'text') renderTimeline();
    });
    inp.addEventListener('change', () => { if (pre) pushHist(pre); pre = null; $('#undoBtn').disabled = !hist.length; });
  });
  const mut = fn => { pushHist(); fn(); box.dataset.for = ''; markDirty(); };
  box.querySelectorAll('[data-ptab]').forEach(b => b.onclick = () => { propTab = b.dataset.ptab; box.dataset.for = ''; renderProps(); });
  box.querySelectorAll('[data-psub]').forEach(b => b.onclick = () => { propSub = b.dataset.psub; box.dataset.for = ''; renderProps(); });
  box.querySelectorAll('[data-asub]').forEach(b => b.onclick = () => { animSub = b.dataset.asub; box.dataset.for = ''; renderProps(); });
  box.querySelectorAll('[data-anim]').forEach(b => b.onclick = () => mut(() => { it.anim = it.anim || {}; const o = it.anim[animSub] = it.anim[animSub] || {}; o.type = b.dataset.anim; if (animSub === 'loop') o.speed = o.speed || 1; else o.dur = o.dur || 0.5; if (b.dataset.anim !== 'none' && animSub !== 'loop') time = animSub === 'in' ? it.start : Math.max(it.start, it.start + it.dur - (o.dur || 0.5) - 0.05); }));
  box.querySelectorAll('[data-set]').forEach(b => b.onclick = () => mut(() => it[b.dataset.set] = b.dataset.v));
  box.querySelectorAll('[data-check]').forEach(c => c.onchange = () => mut(() => it[c.dataset.check] = c.checked));
  const setColor = (key, c) => { c = normHex(c); if (!c) return toast('Mã màu không hợp lệ, ví dụ #C1272C'); addRecent(c); mut(() => it[key] = c); };
  box.querySelectorAll('[data-sw]').forEach(b => b.onclick = () => setColor(b.dataset.sw, b.dataset.c));
  box.querySelectorAll('input[type=color]').forEach(inp => {
    let pre2 = null;
    inp.addEventListener('input', () => { pre2 = pre2 || JSON.stringify(P.data); it[inp.dataset.cc] = inp.value.toUpperCase(); const hx = box.querySelector(`[data-hex="${inp.dataset.cc}"]`); if (hx) hx.value = inp.value.toUpperCase(); });
    inp.addEventListener('change', () => { if (pre2) pushHist(pre2); pre2 = null; addRecent(inp.value.toUpperCase()); box.dataset.for = ''; markDirty(); });
  });
  box.querySelectorAll('[data-hex]').forEach(inp => {
    const go = () => { if (!inp.isConnected) return; const c = normHex(inp.value); if (c && c === normHex(it[inp.dataset.hex])) return; setColor(inp.dataset.hex, inp.value); };
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
    inp.addEventListener('change', () => setTimeout(go, 0));
  });
  box.querySelectorAll('[data-toggle]').forEach(b => b.onclick = () => mut(() => it[b.dataset.toggle] = !it[b.dataset.toggle]));
  box.querySelectorAll('[data-pos]').forEach(b => b.onclick = () => mut(() => { it.y = +b.dataset.pos; it.x = 0.5; }));
  const rs = box.querySelector('[data-reset]'); if (rs) rs.onclick = () => mut(() => { it.x = 0; it.y = 0; it.scale = 1; it.rot = 0; it.opacity = 1; });
  box.querySelector('[data-del]').onclick = del;
  const fb = box.querySelector('[data-fontbtn]');
  if (fb) { const pop = box.querySelector('[data-fontpop]'); fb.onclick = () => { if (pop.classList.toggle('hidden')) return; openFontPop(pop, it.font || 'Montserrat', f => { pop.classList.add('hidden'); addRecentFont(f); mut(() => it.font = f); }); }; }
}
function normHex(c) {
  c = String(c || '').trim().replace(/^#?/, '#').toUpperCase();
  if (/^#[0-9A-F]{3}$/.test(c)) c = '#' + c.slice(1).split('').map(x => x + x).join('');
  return /^#[0-9A-F]{6}$/.test(c) ? c : '';
}
function recentColors() { try { return JSON.parse(LS.get('recentColors', '[]')) || []; } catch { return []; } }
function addRecent(c) { c = normHex(c); if (!c || COLORS.includes(c)) return; LS.set('recentColors', JSON.stringify([c, ...recentColors().filter(x => x !== c)].slice(0, 8))); }
function colorCtl(key, cur) {
  cur = normHex(cur) || '#FFFFFF';
  const sw = c => `<button class="sw ${cur === c ? 'on' : ''}" style="background:${c}" data-sw="${key}" data-c="${c}" title="${c}"></button>`;
  const rec = recentColors();
  return `<div class="color-ctl"><div class="swatches">${COLORS.map(sw).join('')}${rec.length ? '<span class="sw-sep"></span>' + rec.map(sw).join('') : ''}</div>
    <div class="row gap"><input type="color" data-cc="${key}" value="${cur.toLowerCase()}" title="Bảng chọn màu"><input class="hex" data-hex="${key}" value="${cur}" maxlength="7" spellcheck="false" placeholder="#RRGGBB" title="Nhập mã màu rồi bấm Enter"></div></div>`;
}

/* ================= PHÔNG CHỮ ================= */
const FONTS = ['Montserrat', 'Be Vietnam Pro', 'Roboto', 'Inter', 'Open Sans', 'Lexend', 'Nunito', 'Quicksand', 'Baloo 2', 'Comfortaa',
  'Oswald', 'Anton', 'Bangers', 'Playfair Display', 'Merriweather', 'Dancing Script', 'Pacifico', 'Lobster'];
let userFonts = [];
async function loadUserFonts() {
  try {
    userFonts = await LocalStore.listFonts();
    for (const f of userFonts) {
      try { const ff = new FontFace(f.family, await f.blob.arrayBuffer()); await ff.load(); document.fonts.add(ff); } catch (e) { console.warn('font', f.name, e); }
    }
  } catch {}
}
const favFonts = () => { try { return JSON.parse(LS.get('favFonts', '["Montserrat"]')); } catch { return ['Montserrat']; } };
const recentFonts = () => { try { return JSON.parse(LS.get('recentFonts', '[]')); } catch { return []; } };
function addRecentFont(f) { LS.set('recentFonts', JSON.stringify([f, ...recentFonts().filter(x => x !== f)].slice(0, 6))); }
let sysFonts = null;
async function loadSystemFonts() {
  if (sysFonts) return sysFonts;
  if (!window.queryLocalFonts) throw new Error('Thiết bị này không cho đọc phông trên máy');
  const list = await window.queryLocalFonts();
  sysFonts = [...new Set(list.map(f => f.family))].filter(f => !FONTS.includes(f)).sort((a, b) => a.localeCompare(b));
  return sysFonts;
}
function openFontPop(el, cur, pick) {
  let q = '', tab = 'all';
  const row = (f, user) => `<button class="font-opt ${f === cur ? 'on' : ''}" data-f="${f.replace(/"/g, '&quot;')}"><span style="font-family:'${f.replace(/'/g, '')}'">${f}</span>
      <small style="font-family:'${f.replace(/'/g, '')}'">Tiếng Việt có dấu</small><i class="star ${favFonts().includes(f) ? 'on' : ''}" data-star="${f.replace(/"/g, '&quot;')}" title="Yêu thích">★</i>
      ${user ? `<i class="font-del" data-del="${user}" title="Xóa phông">✕</i>` : ''}</button>`;
  const sec = (t, arr, user) => arr.length ? `<div class="fsec">${t}</div>` + arr.map(f => row(f.family || f, user && f.id)).join('') : '';
  const draw = () => {
    const m = f => !q || (f.family || f).toLowerCase().includes(q);
    const fav = favFonts().filter(m), rec = recentFonts().filter(m);
    let body = '';
    if (tab === 'all') body = sec('⭐ Yêu thích', fav) + sec('🕘 Dùng gần đây', rec) + sec('VIECUT · Việt hóa', FONTS.filter(m)) + sec('Phông bạn đã thêm', userFonts.filter(m), true);
    else body = sysFonts ? sec('Phông trên máy', sysFonts.filter(m)) || '<p class="muted small pad">Không có phông phù hợp.</p>' : '<p class="muted small pad">Đang đọc phông trên máy…</p>';
    el.querySelector('.flist').innerHTML = body || '<p class="muted small pad">Không tìm thấy phông.</p>';
    el.querySelectorAll('.font-opt').forEach(b => b.onclick = e => {
      const st = e.target.closest('[data-star]'), dl = e.target.closest('[data-del]');
      if (st) { e.stopPropagation(); const f = st.dataset.star, fv = favFonts(); LS.set('favFonts', JSON.stringify(fv.includes(f) ? fv.filter(x => x !== f) : [f, ...fv])); return draw(); }
      if (dl) { e.stopPropagation(); return LocalStore.deleteFont(dl.dataset.del).then(loadUserFonts).then(draw); }
      pick(b.dataset.f);
    });
  };
  el.innerHTML = `<input class="fsearch" placeholder="🔍 Tìm phông chữ"><div class="ftabs"><button class="on" data-ft="all">VIECUT</button><button data-ft="sys">Trên máy</button></div>
    <div class="flist"></div><label class="font-add">＋ Thêm phông từ file (.ttf, .otf, .woff)<input type="file" accept=".ttf,.otf,.woff,.woff2" hidden></label>`;
  el.querySelector('.fsearch').oninput = e => { q = e.target.value.trim().toLowerCase(); draw(); };
  el.querySelectorAll('[data-ft]').forEach(b => b.onclick = async () => {
    tab = b.dataset.ft; el.querySelectorAll('[data-ft]').forEach(x => x.classList.toggle('on', x === b)); draw();
    if (tab === 'sys' && !sysFonts) { try { await loadSystemFonts(); } catch (err) { sysFonts = []; toast(err.message); } draw(); }
  });
  el.querySelector('.font-add input').onchange = async e => {
    const file = e.target.files[0]; if (!file) return;
    const family = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim().slice(0, 40) || 'Phông của tôi';
    try {
      const ff = new FontFace(family, await file.arrayBuffer()); await ff.load(); document.fonts.add(ff);
      await LocalStore.addFont(file, family); await loadUserFonts(); toast('Đã thêm phông ' + family); pick(family);
    } catch { toast('File phông không hợp lệ'); }
  };
  draw(); setTimeout(() => el.querySelector('.fsearch').focus(), 30);
}
loadUserFonts();

/* ================= XUẤT VIDEO ================= */
let exporting = false, rec = null, chunks = [], exBlob = null, exExt = 'mp4';
function setExProg(p) { $('#exBar').style.width = Math.round(clamp(p, 0, 1) * 100) + '%'; }
function pickMime() {
  const c = ['video/mp4;codecs="avc1.42E01E,mp4a.40.2"', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  return c.find(m => window.MediaRecorder && MediaRecorder.isTypeSupported(m));
}
async function waitReady(ms = 8000) {
  const t0 = Date.now();
  const need = items().filter(i => i.mediaId).map(i => getEl(i.mediaId)).filter(Boolean);
  while (Date.now() - t0 < ms) {
    if (need.every(el => el instanceof HTMLImageElement ? el.complete : el.readyState >= 3)) return;
    await new Promise(r => setTimeout(r, 150));
  }
}
$('#exportBtn').onclick = async () => {
  if (!projDur()) return toast('Timeline đang trống');
  if (window.electronAPI && window.electronAPI.hasEngine) return openNativeExport();
  const mime = pickMime(); if (!mime) return toast('Thiết bị này chưa hỗ trợ xuất video');
  exExt = mime.includes('mp4') ? 'mp4' : 'webm';
  await flushSave(); setPlaying(false); ensureAudio();
  $('#exportModal').classList.remove('hidden'); $('#exDl').classList.add('hidden'); $('#exCancel').textContent = 'Hủy';
  $('#exTitle').textContent = 'Đang chuẩn bị…'; setExProg(0);
  exporting = true; sel = null; renderAll(); time = 0; draw();
  await waitReady(); await new Promise(r => setTimeout(r, 400));
  if (!exporting) return;
  const stream = cv.captureStream(FPS);
  dest.stream.getAudioTracks().forEach(t => stream.addTrack(t));
  chunks = []; rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 12_000_000, audioBitsPerSecond: 192_000 });
  rec.ondataavailable = e => e.data.size && chunks.push(e.data);
  rec.onstop = () => {
    if (!chunks.length) return;
    exBlob = new Blob(chunks, { type: mime.split(';')[0] });
    $('#exTitle').textContent = `Xong! (${(exBlob.size / 1048576).toFixed(1)} MB, .${exExt})`;
    $('#exDl').classList.remove('hidden'); $('#exCancel').textContent = 'Đóng';
  };
  $('#exTitle').textContent = 'Đang xuất video…';
  rec.start(500); time = 0; setPlaying(true);
};
function finishExport() { exporting = false; if (rec && rec.state !== 'inactive') rec.stop(); }
$('#exCancel').onclick = () => {
  if (exporting) { exporting = false; chunks = []; if (rec && rec.state !== 'inactive') rec.stop(); setPlaying(false); }
  $('#exportModal').classList.add('hidden');
};
$('#exDl').onclick = async e => {
  e.preventDefault(); if (!exBlob) return;
  const name = (P.name || 'video').replace(/[\\/:*?"<>|]+/g, '_') + '.' + exExt;
  if (window.NativeBridge && window.NativeBridge.saveVideo) return window.NativeBridge.saveVideo(exBlob, name).then(m => m && toast(m)).catch(err => toast(err.message));
  const a = document.createElement('a'); a.href = URL.createObjectURL(exBlob); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 5000);
};

/* ---- Xuất bằng lõi FFmpeg (app Windows / Linux) ---- */
const RES = { '720p': 720, '1080p': 1080, '2K': 1440, '4K': 2160 };
let nativeBusy = false, nativeOut = '';
function outSize(resKey) {
  const [W, H] = dims(), short = RES[resKey] || 1080, k = short / Math.min(W, H);
  return [Math.round(W * k / 2) * 2, Math.round(H * k / 2) * 2];
}
function openNativeExport() {
  setPlaying(false);
  const m = $('#nexModal'); m.classList.remove('hidden');
  $('#nexForm').classList.remove('hidden'); $('#nexRun').classList.add('hidden');
  $('#nexName').value = (P.name || 'video').replace(/[\\/:*?"<>|]+/g, '_');
  $('#nexRes').value = LS.get('exRes', '1080p'); $('#nexFps').value = LS.get('exFps', '30'); $('#nexQ').value = LS.get('exQ', 'high');
  updateNexInfo();
}
function updateNexInfo() {
  const [w, h] = outSize($('#nexRes').value);
  $('#nexInfo').textContent = `${w}×${h} · ${$('#nexFps').value} fps · ${fmt(projDur())} · MP4 (H.264 + AAC)`;
}
['#nexRes', '#nexFps', '#nexQ'].forEach(id => $(id).onchange = updateNexInfo);
$('#nexClose').onclick = () => { if (!nativeBusy) $('#nexModal').classList.add('hidden'); };
async function textSegments(outW, outH, fps, setStep) {
  const [W, H] = dims(), k = outW / W, segs = {}, tmp = [], dirs = [];
  const texts = items().filter(i => i.kind === 'text' && String(i.text || '').trim() && !hiddenItem(i));
  if (document.fonts) {
    for (const f of [...new Set(texts.map(i => i.font || 'Montserrat'))]) { try { await document.fonts.load(`800 60px "${f}"`, 'Việt'); await document.fonts.load(`500 60px "${f}"`, 'Việt'); } catch {} }
  }
  const off = typeof OffscreenCanvas !== 'undefined';
  const c = off ? new OffscreenCanvas(outW, outH) : Object.assign(document.createElement('canvas'), { width: outW, height: outH }); const g = c.getContext('2d');
  const shot = async (it, tl) => {
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, outW, outH); g.scale(k, k); drawText(it, W, H, g, tl);
    const b = off ? await c.convertToBlob({ type: 'image/png' }) : await new Promise(r => c.toBlob(r, 'image/png'));
    return b.arrayBuffer();
  };
  let n = 0;
  for (const it of texts) {
    n++; const d = animDurs(it), list = [];
    const seq = async (key, t0, frames) => { let dir = ''; for (let i = 0; i < frames; i++) dir = await window.electronAPI.writeFrame(key, i, await shot(it, t0 + i / fps)); dirs.push(dir); return dir; };
    if (!d.inD && !d.outD && !d.loop) {
      const f = await window.electronAPI.writeTemp('text-' + it.id + '.png', await shot(it, null)); tmp.push(f);
      list.push({ start: it.start, dur: it.dur, png: f });
    } else {
      setStep(`Đang dựng hiệu ứng chữ ${n}/${texts.length}…`);
      const inF = Math.round(d.inD * fps), outF = Math.round(d.outD * fps);
      if (inF) list.push({ start: it.start, dur: inF / fps, seq: await seq(it.id + '-in-' + Date.now(), 0, inF), fps });
      const midS = it.start + inF / fps, midD = it.dur - inF / fps - outF / fps;
      if (midD > 0.001) {
        if (d.loop) { const pf = Math.max(2, Math.round(d.loop * fps)); list.push({ start: midS, dur: midD, seq: await seq(it.id + '-loop-' + Date.now(), inF / fps, pf), fps, loop: true }); }
        else { const f = await window.electronAPI.writeTemp('text-' + it.id + '-mid.png', await shot(it, inF / fps + 0.0001)); tmp.push(f); list.push({ start: midS, dur: midD, png: f }); }
      }
      if (outF) list.push({ start: it.start + it.dur - outF / fps, dur: outF / fps, seq: await seq(it.id + '-out-' + Date.now(), it.dur - outF / fps, outF), fps });
    }
    segs[it.id] = list;
  }
  return { segs, tmp, dirs };
}
async function mediaFiles(setStep) {
  const used = [...new Set(items().filter(i => i.mediaId && !hiddenItem(i)).map(i => i.mediaId))];
  const ms = used.map(mById).filter(Boolean);
  const ok = await window.electronAPI.existing(ms.map(m => m.path || ''));
  const out = {}, tmp = [];
  for (let i = 0; i < ms.length; i++) {
    const m = ms[i];
    let p = ok[i] ? m.path : '';
    if (!p) { // file không còn ở chỗ cũ hoặc nằm trên đám mây: ghi ra file tạm
      setStep(`Đang chuẩn bị ${m.name}…`);
      const r = await fetch(mediaUrl(m)); if (!r.ok) throw new Error('Không đọc được ' + m.name);
      p = await window.electronAPI.writeTemp(m.name, await r.arrayBuffer()); tmp.push(p);
    }
    out[m.id] = { path: p, width: m.width, height: m.height };
  }
  return { out, tmp };
}
$('#nexGo').onclick = async () => {
  const name = ($('#nexName').value.trim() || 'video').replace(/[\\/:*?"<>|]+/g, '_') + '.mp4';
  LS.set('exRes', $('#nexRes').value); LS.set('exFps', $('#nexFps').value); LS.set('exQ', $('#nexQ').value);
  const out = await window.electronAPI.chooseSave(name); if (!out) return;
  const [outW, outH] = outSize($('#nexRes').value), fps = +$('#nexFps').value;
  const Q = { std: [23, 'veryfast'], high: [19, 'veryfast'], best: [17, 'medium'] }[$('#nexQ').value] || [19, 'veryfast'];
  nativeBusy = true; nativeOut = out;
  $('#nexForm').classList.add('hidden'); $('#nexRun').classList.remove('hidden');
  $('#nexDone').classList.add('hidden'); $('#nexCancel').classList.remove('hidden');
  const step = t => $('#nexStep').textContent = t; const bar = p => { $('#nexBar').style.width = Math.round(p * 100) + '%'; $('#nexPct').textContent = Math.round(p * 100) + '%'; };
  bar(0); step('Đang chuẩn bị…');
  const t0 = Date.now(); let tempFiles = [], tempDirs = [];
  try {
    await flushSave();
    const mf = await mediaFiles(step); tempFiles.push(...mf.tmp);
    const tp = await textSegments(outW, outH, fps, step); tempFiles.push(...tp.tmp); tempDirs.push(...tp.dirs);
    const [W, H] = dims();
    step('Đang dựng video bằng lõi FFmpeg…'); const tf = Date.now();
    window.electronAPI.onExportProgress(p => { bar(p); const el = (Date.now() - tf) / 1000; if (p > 0.02) step(`Đang dựng video… còn khoảng ${Math.max(1, Math.round(el / p - el))} giây`); });
    await window.electronAPI.exportStart({
      W, H, outW, outH, fps, crf: Q[0], preset: Q[1], duration: projDur(), out,
      items: JSON.parse(JSON.stringify(items().filter(i => !hiddenItem(i)).map(i => mutedItem(i) ? { ...i, volume: 0 } : i))),
      media: mf.out, textSegs: tp.segs, tempFiles, tempDirs,
    });
    bar(1); step(`Xong sau ${((Date.now() - t0) / 1000).toFixed(1)} giây · ${out}`);
    $('#nexDone').classList.remove('hidden'); $('#nexCancel').classList.add('hidden');
  } catch (err) {
    step(err.cancelled || /Đã hủy/.test(err.message) ? 'Đã hủy xuất video' : 'Lỗi: ' + err.message);
    $('#nexCancel').classList.add('hidden'); $('#nexDone').classList.remove('hidden'); $('#nexOpen').classList.add('hidden');
  } finally { nativeBusy = false; }
};
$('#nexCancel').onclick = () => window.electronAPI.exportCancel();
$('#nexOpen').onclick = () => nativeOut && window.electronAPI.showItem(nativeOut);
$('#nexOk').onclick = () => { $('#nexModal').classList.add('hidden'); $('#nexOpen').classList.remove('hidden'); };

/* ================= KHỞI ĐỘNG ================= */
(async () => {
  if (document.fonts) document.fonts.load('600 40px Montserrat').catch(() => {});
  openHome();
  if (token && SERVER) {
    try { me = await api('/api/me'); renderAcct(); } catch { me = null; renderAcct(); }
  }
})();
