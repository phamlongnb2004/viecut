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
}
applyTheme(LS.get('theme', 'light'));
$$('.theme-btn').forEach(b => b.addEventListener('click', e => {
  e.preventDefault();
  const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  LS.set('theme', t); applyTheme(t);
}));

/* ================= ĐĂNG NHẬP ================= */
$('#asrv').value = SERVER;
if (FIXED_SERVER) { $('#asrv').classList.add('hidden'); $('#asrv').required = false; }
let authAct = 'login';
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
    token = d.token; LS.set('tk', token); me = d.user; openProjects();
  } catch (err) { $('#amsg').textContent = err.message; }
});
function logout() { token = ''; LS.del('tk'); me = null; show('auth'); }
$('#logoutBtn').onclick = logout;

/* ================= DỰ ÁN ================= */
async function openProjects() {
  show('projects');
  $('#meName').textContent = me ? me.username : '';
  const list = $('#projList'); list.innerHTML = '<p class="muted">Đang tải…</p>';
  try {
    const ps = await api('/api/projects');
    list.innerHTML = ps.length ? '' : '<p class="muted">Chưa có dự án nào. Bấm “+ Dự án mới”.</p>';
    for (const p of ps) {
      const d = document.createElement('div'); d.className = 'proj';
      d.innerHTML = `<div class="pname"></div><div class="row"><span class="muted small">${p.aspect || ''} · ${new Date(p.updated).toLocaleString('vi-VN')}</span><button class="del" title="Xóa">🗑</button></div>`;
      d.querySelector('.pname').textContent = p.name;
      d.onclick = () => openEditor(p.id);
      d.querySelector('.del').onclick = async ev => {
        ev.stopPropagation();
        if (d.dataset.confirm) { await api('/api/projects/' + p.id, { method: 'DELETE' }); openProjects(); }
        else { d.dataset.confirm = 1; ev.target.textContent = 'Xóa?'; setTimeout(() => { delete d.dataset.confirm; ev.target.textContent = '🗑'; }, 2500); }
      };
      list.appendChild(d);
    }
  } catch (err) { list.innerHTML = ''; toast(err.message); }
}
$('#newProj').onclick = async () => {
  const p = await api('/api/projects', { method: 'POST', json: { name: 'Dự án ' + new Date().toLocaleDateString('vi-VN'), aspect: $('#newAspect').value } });
  openEditor(p.id);
};

/* ================= EDITOR: STATE ================= */
const ASPECT = { '9:16': [1080, 1920], '16:9': [1920, 1080], '1:1': [1080, 1080], '4:5': [1080, 1350] };
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
const mediaUrl = m => `${SERVER}/api/media/${m.id}/file?t=${encodeURIComponent(token)}`;

async function openEditor(id) {
  try {
    const [p, ms] = await Promise.all([api('/api/projects/' + id), api('/api/media')]);
    P = p; P.data.items = P.data.items || []; media = ms;
  } catch (err) { return toast(err.message); }
  sel = null; time = 0; hist = []; fut = [];
  $('#projName').value = P.name; $('#aspectSel').value = P.data.aspect;
  show('editor'); setCanvasSize(); renderMedia(); renderAll(); setSave('Đã lưu');
}
$('#backBtn').onclick = async () => { setPlaying(false); await flushSave(); openProjects(); };
$('#projName').onchange = () => { P.name = $('#projName').value || 'Dự án'; markDirty(true); };
$('#aspectSel').onchange = () => { pushHist(); P.data.aspect = $('#aspectSel').value; setCanvasSize(); markDirty(); };
function setCanvasSize() { const [w, h] = ASPECT[P.data.aspect]; cv.width = w; cv.height = h; }

/* ---- lưu tự động ---- */
function setSave(s) { $('#saveState').textContent = s; }
function markDirty(nameOnly) {
  dirty = true; setSave('Đang lưu…'); renderAll();
  clearTimeout(saveT); saveT = setTimeout(flushSave, nameOnly ? 300 : 1200);
}
async function flushSave() {
  clearTimeout(saveT); if (!dirty || !P) return; dirty = false;
  const data = JSON.parse(JSON.stringify(P.data));
  try { await api('/api/projects/' + P.id, { method: 'PUT', json: { name: P.name, data } }); setSave('Đã lưu'); }
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
$$('.tab').forEach(t => t.onclick = () => {
  $$('.tab').forEach(x => x.classList.toggle('active', x === t));
  $$('.tab-body').forEach(b => b.classList.toggle('hidden', b.id !== 'tab-' + t.dataset.tab));
});
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
    const done = r => { URL.revokeObjectURL(url); res(Object.assign({ kind }, r)); };
    if (kind === 'image') {
      const im = new Image();
      im.onload = () => done({ duration: 5, width: im.naturalWidth, height: im.naturalHeight, thumb: mkThumb(im, im.naturalWidth, im.naturalHeight) });
      im.onerror = () => done({}); im.src = url; return;
    }
    const el = document.createElement(kind); el.preload = 'metadata'; el.muted = true; el.playsInline = true; el.src = url;
    el.onerror = () => done({ duration: 0 });
    el.onloadedmetadata = () => {
      if (kind === 'audio') return done({ duration: el.duration });
      el.onseeked = () => done({ duration: el.duration, width: el.videoWidth, height: el.videoHeight, thumb: mkThumb(el, el.videoWidth, el.videoHeight) });
      el.currentTime = Math.min(0.5, el.duration / 2);
    };
    setTimeout(() => done({ duration: el.duration || 0 }), 15000);
  });
}
function uploadFile(file, meta, onProg) {
  return new Promise((res, rej) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(meta)) if (v !== undefined) fd.append(k, v);
    fd.append('file', file);
    const x = new XMLHttpRequest(); x.open('POST', SERVER + '/api/media');
    x.setRequestHeader('Authorization', 'Bearer ' + token);
    x.upload.onprogress = e => e.lengthComputable && onProg(e.loaded / e.total);
    x.onload = () => x.status < 300 ? res(JSON.parse(x.responseText)) : rej(new Error('Tải lên lỗi ' + x.status));
    x.onerror = () => rej(new Error('Tải lên lỗi mạng')); x.send(fd);
  });
}
$('#fileIn').onchange = async e => {
  const files = [...e.target.files]; e.target.value = '';
  for (let i = 0; i < files.length; i++) {
    const f = files[i], tag = `(${i + 1}/${files.length}) ${f.name}`;
    $('#upProg').textContent = 'Đang đọc ' + tag;
    const meta = await probe(f);
    try {
      const m = await uploadFile(f, meta, p => $('#upProg').textContent = `Tải lên ${tag}: ${Math.round(p * 100)}%`);
      media.push(m); renderMedia();
    } catch (err) { toast(err.message); }
  }
  $('#upProg').textContent = '';
};
function renderMedia() {
  const g = $('#mediaGrid'); g.innerHTML = '';
  if (!media.length) g.innerHTML = '<p class="muted small" style="grid-column:1/-1">Chưa có file. Nhập video, ảnh hoặc nhạc để bắt đầu.</p>';
  for (const m of [...media].reverse()) {
    const d = document.createElement('div'); d.className = 'media'; d.title = m.name;
    d.innerHTML = (m.thumb ? `<img src="${m.thumb}">` : `<div class="ph">${m.kind === 'audio' ? '♪' : '▶'}</div>`) +
      `<div class="meta"></div><span class="dur">${m.kind === 'image' ? 'Ảnh' : fmt(m.duration)}</span><button class="add" title="Thêm vào timeline">+</button><button class="rm" title="Xóa khỏi thư viện">×</button>`;
    d.querySelector('.meta').textContent = m.name;
    d.querySelector('.add').onclick = ev => { ev.stopPropagation(); addMedia(m); };
    d.ondblclick = () => addMedia(m);
    d.querySelector('.rm').onclick = async ev => {
      ev.stopPropagation();
      if (items().some(i => i.mediaId === m.id)) return toast('File đang dùng trong dự án, xóa clip trước');
      await api('/api/media/' + m.id, { method: 'DELETE' }); media = media.filter(x => x.id !== m.id); renderMedia();
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
function drawFit(src, sw, sh, it, W, H) {
  if (!sw || !sh) return;
  const s = (it.fit === 'cover' ? Math.max(W / sw, H / sh) : Math.min(W / sw, H / sh)) * (it.scale || 1);
  const w = sw * s, h = sh * s;
  ctx.drawImage(src, (W - w) / 2 + (it.x || 0) * W, (H - h) / 2 + (it.y || 0) * H, w, h);
}
function roundRect(x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function drawText(it, W, H) {
  const lines = String(it.text || '').split('\n'), size = it.size || 64, lh = size * 1.22;
  ctx.font = `normal ${it.bold ? 800 : 600} ${size}px Montserrat, sans-serif`; // luôn chữ đứng, không nghiêng
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const wMax = Math.max(...lines.map(l => ctx.measureText(l).width), 10);
  const cx = it.x * W, cy = it.y * H, top = cy - (lines.length * lh) / 2;
  const box = { x: cx - wMax / 2 - size * 0.4, y: top - size * 0.2, w: wMax + size * 0.8, h: lines.length * lh + size * 0.4 };
  textBoxes.set(it.id, box);
  if (it.bg) { ctx.fillStyle = it.bgColor || '#152758'; roundRect(box.x, box.y, box.w, box.h, size * 0.25); ctx.fill(); }
  lines.forEach((l, i) => {
    const y = top + lh * (i + 0.5);
    if (it.stroke) { ctx.lineWidth = size * 0.14; ctx.lineJoin = 'round'; ctx.strokeStyle = it.strokeColor || '#000'; ctx.strokeText(l, cx, y); }
    ctx.fillStyle = it.color || '#fff'; ctx.fillText(l, cx, y);
  });
  if (it.id === sel && !exporting) { ctx.strokeStyle = '#ffd34d'; ctx.lineWidth = 4; ctx.setLineDash([16, 10]); ctx.strokeRect(box.x, box.y, box.w, box.h); ctx.setLineDash([]); }
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
  const visual = items().filter(i => (i.kind === 'video' || i.kind === 'image') && act(i)).sort((a, b) => a.start - b.start);
  for (const it of items()) {
    if ((it.kind === 'video' || it.kind === 'audio') && act(it)) {
      const el = getEl(it.mediaId); if (!el) continue;
      syncMedia(el, it.in + (t - it.start), playing, it.volume ?? 1); used.add(el);
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
  items().filter(i => i.kind === 'text' && act(i)).sort((a, b) => a.start - b.start).forEach(i => drawText(i, W, H));
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
  if (P && !$('#editor').classList.contains('hidden')) { draw(); updatePlayhead(); }
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
cv.addEventListener('pointerdown', e => {
  const p = canvasPt(e); let hit = null;
  const texts = items().filter(i => i.kind === 'text' && textBoxes.has(i.id)).reverse();
  for (const it of texts) { const b = textBoxes.get(it.id); if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) { hit = it; break; } }
  if (!hit) hit = items().filter(i => (i.kind === 'video' || i.kind === 'image') && time >= i.start && time < i.start + i.dur).pop();
  if (!hit) { sel = null; renderAll(); return; }
  sel = hit.id; renderAll();
  const snap = JSON.stringify(P.data), ox = hit.x, oy = hit.y; let moved = false;
  cv.setPointerCapture(e.pointerId);
  const mv = ev => {
    const q = canvasPt(ev), dx = (q.x - p.x) / cv.width, dy = (q.y - p.y) / cv.height; moved = true;
    hit.x = ox + dx; hit.y = oy + dy;
    if (hit.kind === 'text') { if (Math.abs(hit.x - 0.5) < 0.015) hit.x = 0.5; } // hít vào giữa
    else { if (Math.abs(hit.x) < 0.015) hit.x = 0; if (Math.abs(hit.y) < 0.015) hit.y = 0; }
  };
  const up = () => { cv.removeEventListener('pointermove', mv); cv.removeEventListener('pointerup', up); if (moved) { pushHist(snap); markDirty(); } };
  cv.addEventListener('pointermove', mv); cv.addEventListener('pointerup', up);
});

/* ================= TIMELINE ================= */
$('#tlLabels').innerHTML = TRACKS.map(t => `<div>${t.name}</div>`).join('');
$('#zoom').oninput = e => { zoom = +e.target.value; renderTimeline(); };
function renderAll() { renderTimeline(); renderProps(); $('#undoBtn').disabled = !hist.length; $('#redoBtn').disabled = !fut.length; }
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
      const c = document.createElement('div'); c.className = `clip ${it.kind}${it.id === sel ? ' sel' : ''}`; c.dataset.id = it.id;
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

/* ================= BẢNG THUỘC TÍNH ================= */
function renderProps() {
  const box = $('#props'), it = selItem();
  if (!it) { box.innerHTML = '<div class="props"><h4>Thuộc tính</h4><p class="muted small">Chọn một clip trên timeline hoặc khung hình để chỉnh.<br><br>Phím tắt: Space phát/dừng · S tách · Delete xóa · Ctrl+Z hoàn tác</p></div>'; return; }
  if (box.dataset.for === it.id && box.contains(document.activeElement) && document.activeElement !== document.body) return; // đang gõ
  box.dataset.for = it.id;
  const names = { video: 'Video', image: 'Ảnh', audio: 'Âm thanh', text: 'Chữ' };
  let h = `<div class="props"><h4>${names[it.kind]}</h4>
    <div class="prop"><label>Bắt đầu <b>${fmt(it.start)}</b></label><label>Thời lượng <b>${it.dur.toFixed(2)} s</b></label></div>`;
  if (it.kind === 'text') {
    h += `<div class="prop"><label>Nội dung</label><textarea data-k="text"></textarea></div>
      <div class="prop"><label>Cỡ chữ <b>${it.size}</b></label><input type="range" min="20" max="260" data-k="size" data-num value="${it.size}"></div>
      <div class="prop"><label>Màu chữ</label>${swatches('color', it.color)}</div>
      <div class="prop"><label>Kiểu</label><div class="seg">
        <button class="btn ${it.bold ? 'on' : ''}" data-toggle="bold">Đậm</button>
        <button class="btn ${it.stroke ? 'on' : ''}" data-toggle="stroke">Viền</button>
        <button class="btn ${it.bg ? 'on' : ''}" data-toggle="bg">Nền</button></div></div>
      ${it.stroke ? `<div class="prop"><label>Màu viền</label>${swatches('strokeColor', it.strokeColor)}</div>` : ''}
      ${it.bg ? `<div class="prop"><label>Màu nền</label>${swatches('bgColor', it.bgColor)}</div>` : ''}
      <div class="prop"><label>Vị trí nhanh</label><div class="seg">
        <button class="btn" data-pos="0.2">Trên</button><button class="btn" data-pos="0.5">Giữa</button><button class="btn" data-pos="0.7">Dưới</button></div></div>`;
  }
  if (it.kind === 'video' || it.kind === 'image') {
    h += `<div class="prop"><label>Thu phóng <b>${Math.round((it.scale || 1) * 100)}%</b></label><input type="range" min="0.2" max="3" step="0.01" data-k="scale" data-num value="${it.scale || 1}"></div>
      <div class="prop"><label>Khung</label><div class="seg">
        <button class="btn ${it.fit !== 'cover' ? 'on' : ''}" data-fit="contain">Vừa khung</button>
        <button class="btn ${it.fit === 'cover' ? 'on' : ''}" data-fit="cover">Lấp đầy</button></div></div>
      <div class="prop"><button class="btn" data-reset>Đặt lại vị trí</button></div>`;
  }
  if (it.kind === 'video' || it.kind === 'audio') {
    h += `<div class="prop"><label>Âm lượng <b>${Math.round((it.volume ?? 1) * 100)}%</b></label><input type="range" min="0" max="2" step="0.01" data-k="volume" data-num value="${it.volume ?? 1}"></div>`;
  }
  h += `<div class="prop"><button class="btn danger" data-del>Xóa clip</button></div></div>`;
  box.innerHTML = h;
  const ta = box.querySelector('textarea'); if (ta) ta.value = it.text;
  let pre = null;
  box.querySelectorAll('[data-k]').forEach(inp => {
    inp.addEventListener('focus', () => pre = JSON.stringify(P.data));
    inp.addEventListener('pointerdown', () => pre = pre || JSON.stringify(P.data));
    inp.addEventListener('input', () => {
      it[inp.dataset.k] = inp.dataset.num !== undefined ? +inp.value : inp.value;
      const lab = inp.previousElementSibling && inp.previousElementSibling.querySelector('b');
      if (lab && inp.dataset.k === 'size') lab.textContent = inp.value;
      if (lab && inp.dataset.k === 'scale') lab.textContent = Math.round(inp.value * 100) + '%';
      if (lab && inp.dataset.k === 'volume') lab.textContent = Math.round(inp.value * 100) + '%';
      dirty = true; setSave('Đang lưu…'); clearTimeout(saveT); saveT = setTimeout(flushSave, 1200);
      if (inp.dataset.k === 'text') renderTimeline();
    });
    inp.addEventListener('change', () => { if (pre) pushHist(pre); pre = null; $('#undoBtn').disabled = !hist.length; });
  });
  const mut = fn => { pushHist(); fn(); box.dataset.for = ''; markDirty(); };
  box.querySelectorAll('[data-sw]').forEach(b => b.onclick = () => mut(() => it[b.dataset.sw] = b.dataset.c));
  box.querySelectorAll('input[type=color]').forEach(inp => {
    inp.onchange = () => mut(() => it[inp.dataset.cc] = inp.value.toUpperCase());
  });
  box.querySelectorAll('[data-toggle]').forEach(b => b.onclick = () => mut(() => it[b.dataset.toggle] = !it[b.dataset.toggle]));
  box.querySelectorAll('[data-pos]').forEach(b => b.onclick = () => mut(() => { it.y = +b.dataset.pos; it.x = 0.5; }));
  box.querySelectorAll('[data-fit]').forEach(b => b.onclick = () => mut(() => it.fit = b.dataset.fit));
  const rs = box.querySelector('[data-reset]'); if (rs) rs.onclick = () => mut(() => { it.x = 0; it.y = 0; it.scale = 1; });
  box.querySelector('[data-del]').onclick = del;
}
function swatches(key, cur) {
  return `<div class="swatches">${COLORS.map(c => `<button class="sw ${String(cur).toUpperCase() === c ? 'on' : ''}" style="background:${c}" data-sw="${key}" data-c="${c}" title="${c}"></button>`).join('')}
    <input type="color" data-cc="${key}" value="${cur || '#ffffff'}" title="Màu khác"></div>`;
}

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

/* ================= KHỞI ĐỘNG ================= */
(async () => {
  if (document.fonts) document.fonts.load('600 40px Montserrat').catch(() => {});
  if (token && SERVER) {
    try { me = await api('/api/me'); return openProjects(); } catch {}
  }
  show('auth');
})();
