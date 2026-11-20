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
const TRACKS = [{ id: 'text', name: 'Chữ' }, { id: 'sticker', name: 'Nhãn dán' }, { id: 'fx', name: 'Hiệu ứng' }, { id: 'video', name: 'Video' }, { id: 'audio', name: 'Âm thanh' }];
const visTracks = () => TRACKS.filter(t => t.id === 'video' || t.id === 'audio' || (P && items().some(i => trackOf(i) === t.id)));
const COLORS = ['#FFFFFF', '#000000', '#C1272C', '#152758'];
const FPS = 30;
let P = null, media = [], sel = null, time = 0, playing = false, zoom = 60;
let hist = [], fut = [], dirty = false, saveT = null;
const els = {};              // mediaId -> element
const cv = $('#cv'), ctx = cv.getContext('2d');
const textBoxes = new Map(); // itemId -> box trên canvas
const trackOf = it => it.kind === 'image' ? 'video' : it.kind === 'text' && it.st ? 'sticker' : it.kind;
const spd = it => Math.max(0.05, it.speed || 1);
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
  if (P.data.magnet === undefined && !P.data.items.length) P.data.magnet = true;
  $('#projName').value = P.name; $('#aspectSel').value = P.data.aspect;
  show('editor'); applyLayout(); setCanvasSize(); setAssetTab('media'); renderAll(); setSave('Đã lưu');
}
$('#backBtn').onclick = async () => { setPlaying(false); await flushSave(); openHome(); };
$('#projName').onchange = () => { P.name = $('#projName').value || 'Dự án'; markDirty(true); };
$('#aspectSel').onchange = () => { pushHist(); P.data.aspect = $('#aspectSel').value; setCanvasSize(); markDirty(); };
function setCanvasSize() { const [w, h] = dims(); if (cv.width !== w) cv.width = w; if (cv.height !== h) cv.height = h; }

/* ---- lưu tự động ---- */
function setSave(s) { $('#saveState').textContent = s === 'Đã lưu' ? '✓ Tự động lưu: ' + new Date().toLocaleTimeString('vi-VN') : s; }
function packMain() { // nam châm: các clip trên track video nối sát nhau từ 0
  let t = 0; for (const it of items().filter(i => trackOf(i) === 'video').sort((a, b) => a.start - b.start)) { it.start = +t.toFixed(4); t += it.dur; }
}
function markDirty(nameOnly) {
  if (!nameOnly && P && P.data.magnet) packMain();
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
let assetTab = 'media', mediaFilter = 'all', libSub = '';
const SUBS = {
  media: [['all', 'Tất cả'], ['video', 'Video'], ['image', 'Ảnh']],
  audio: [['sfx', 'Hiệu ứng âm thanh'], ['audio', 'Nhạc của bạn']],
  text: [['text', 'Mẫu chữ'], ['srt', 'Phụ đề .srt']],
  sticker: [...Object.keys(STICKERS).map(k => [k, k]), ['shape', 'Hình vẽ']],
  fx: [['vfx', 'Hiệu ứng video']], trans: [['trans', 'Chuyển cảnh']], caption: [['srt', 'Nhập phụ đề']],
  filter: [['filter', 'Bộ lọc màu']], adjust: [['adjust', 'Điều chỉnh màu']],
};
function setAssetTab(t, sub) {
  assetTab = t;
  $$('.cat-i').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
  const subs = SUBS[t] || [['soon', 'Sắp có']];
  libSub = sub || subs[0][0];
  const body = t === 'media' || (t === 'audio' && libSub === 'audio') ? 'media' : t === 'text' && libSub === 'text' ? 'text' : 'lib';
  $$('.tab-body').forEach(b => b.classList.toggle('hidden', b.id !== 'tab-' + body));
  if (t === 'audio') mediaFilter = 'audio'; else if (t === 'media') mediaFilter = 'all';
  $('#subNav').innerHTML = subs.map(([k, l]) => `<button class="sub-i ${k === libSub ? 'on' : ''}" data-f="${k}">${l}</button>`).join('');
  $$('#subNav .sub-i').forEach(b => b.onclick = () => {
    if (t === 'media') { $$('#subNav .sub-i').forEach(x => x.classList.toggle('on', x === b)); mediaFilter = b.dataset.f; renderMedia(); }
    else setAssetTab(t, b.dataset.f);
  });
  $('#fileIn').accept = t === 'audio' ? 'audio/*' : 'video/*,audio/*,image/*';
  if (body === 'media') renderMedia(); else if (body === 'lib') renderLib();
}
function selVisual() { const it = selItem(); return it && isVis(it) ? it : null; }
function renderLib() {
  const el = $('#tab-lib'), t = assetTab, sub = libSub; let h = '';
  if (t === 'audio') {
    h = `<p class="lib-note">Âm thanh do VIECUT tự tạo, dùng thoải mái không lo bản quyền. Bấm ▶ để nghe thử, ＋ để thêm vào con trỏ thời gian.</p>` +
      SFX.map(([k, l]) => `<div class="sfx-row"><b>🔊 ${l}</b><button class="btn" data-play="${k}">▶</button><button class="btn primary" data-addsfx="${k}">＋</button></div>`).join('');
  } else if (t === 'sticker') {
    if (sub === 'shape') h = `<div class="lib-h">Hình vẽ (đổi màu được)</div><div class="lib-grid">${SHAPES.map(([k, l]) => `<button class="lib-c" data-shape="${k}"><canvas width="88" height="64" data-prev="${k}"></canvas><small>${l}</small></button>`).join('')}</div>`;
    else h = `<div class="lib-h">${sub}</div><div class="lib-grid emoji">${(STICKERS[sub] || []).map(e => `<button class="lib-c" data-emoji="${e}"><span class="ic">${e}</span></button>`).join('')}</div>`;
  } else if (t === 'fx') {
    h = `<p class="lib-note">Hiệu ứng được thêm lên track Hiệu ứng tại con trỏ thời gian, áp lên video bên dưới.</p><div class="lib-grid">${VFX.map(([k, l, ic]) => `<button class="lib-c" data-vfx="${k}"><span class="ic">${ic}</span><small>${l}</small></button>`).join('')}</div>`;
  } else if (t === 'trans') {
    const it = selVisual(), cur = it && it.trans && it.trans.type;
    h = `<p class="lib-note">${it ? 'Bấm để thêm chuyển cảnh vào đầu clip đang chọn (nối với clip ngay trước).' : 'Chọn một clip video/ảnh trên timeline (clip phía sau chỗ nối) rồi bấm chuyển cảnh.'}</p>
      <div class="lib-grid"><button class="lib-c ${it && !cur ? 'on' : ''}" data-tr="none"><span class="ic">⊘</span><small>Không có</small></button>${TRANSITIONS.map(([k, l, ic]) => `<button class="lib-c ${cur === k ? 'on' : ''}" data-tr="${k}"><span class="ic">${ic}</span><small>${l}</small></button>`).join('')}</div>`;
  } else if (t === 'filter') {
    const it = selVisual(), m = it ? mById(it.mediaId) : media.find(x => x.thumb), th = m && m.thumb, cur = it && it.filter && it.filter.id;
    h = `<p class="lib-note">${it ? 'Bấm để áp bộ lọc cho clip đang chọn. Chỉnh cường độ ở bảng Chi tiết › Điều chỉnh.' : 'Chọn một clip video/ảnh trên timeline trước.'}</p>
      <div class="lib-grid"><button class="lib-c ${it && !cur ? 'on' : ''}" data-flt=""><div class="th" style="${th ? `background-image:url(${th})` : ''}"></div><small>Gốc</small></button>
      ${FILTERS.map(([k, l, a]) => `<button class="lib-c ${cur === k ? 'on' : ''}" data-flt="${k}"><div class="th" style="${th ? `background-image:url(${th});` : ''}filter:${cssFilter(effAdj({ filter: { id: k } }))}"></div><small>${l}</small></button>`).join('')}</div>`;
  } else if (t === 'adjust') {
    const it = selVisual();
    h = `<p class="lib-note">Chỉnh nhiệt độ màu, độ bão hòa, phơi sáng, tương phản, làm mờ, hạt, viền tối… cho từng clip.</p>${it ? '<button class="btn primary block" data-openadj>🎚️ Mở bảng điều chỉnh của clip đang chọn</button>' : '<p class="muted small">Chọn một clip video/ảnh trên timeline trước.</p>'}`;
  } else if (sub === 'srt') {
    h = `<p class="lib-note">Nhập file phụ đề <b>.srt</b> hoặc <b>.vtt</b>: mỗi câu thành một khối chữ đúng thời gian, phông Montserrat, nằm trong vùng an toàn. Phụ đề tự động bằng giọng nói sẽ có ở bản sau.</p>
      <label class="btn primary block">📄 Chọn file phụ đề<input type="file" id="srtIn" accept=".srt,.vtt,text/plain" hidden></label>
      <div class="prop row2" style="margin-top:12px"><label>Bắt đầu từ con trỏ</label><label class="switch"><input type="checkbox" id="srtAtCur"><span></span></label></div>`;
  } else h = '<div class="empty"><div class="empty-ic">🚧</div><b>Sắp có</b></div>';
  el.innerHTML = h;
  el.querySelectorAll('canvas[data-prev]').forEach(c => { const g = c.getContext('2d'); g.translate(44, 32); drawShape(g, c.dataset.prev, 70, c.dataset.prev === 'underline' ? 22 : c.dataset.prev === 'arrow' ? 30 : 52, '#C1272C', 5); });
  el.querySelectorAll('[data-play]').forEach(b => b.onclick = async () => { const u = URL.createObjectURL(await makeSfx(b.dataset.play)); const a = new Audio(u); a.onended = () => URL.revokeObjectURL(u); a.play(); });
  el.querySelectorAll('[data-addsfx]').forEach(b => b.onclick = () => addSfx(b.dataset.addsfx));
  el.querySelectorAll('[data-emoji]').forEach(b => b.onclick = () => addSticker({ st: 'emoji', text: b.dataset.emoji, size: 160 }));
  el.querySelectorAll('[data-shape]').forEach(b => b.onclick = () => addSticker({ st: 'shape', shape: b.dataset.shape, y: 0.55, size: 120, color: '#C1272C', strokeW: 0.1 }));
  el.querySelectorAll('[data-vfx]').forEach(b => b.onclick = () => { pushHist(); const it = { id: uid(), kind: 'fx', type: b.dataset.vfx, start: time, dur: 3 }; items().push(it); sel = it.id; markDirty(); });
  el.querySelectorAll('[data-tr]').forEach(b => b.onclick = () => { const it = selVisual(); if (!it) return toast('Chọn clip video/ảnh trước'); pushHist(); if (b.dataset.tr === 'none') delete it.trans; else { it.trans = { type: b.dataset.tr, dur: (it.trans && it.trans.dur) || 0.6 }; time = Math.max(0, it.start - 0.6); } markDirty(); renderLib(); });
  el.querySelectorAll('[data-flt]').forEach(b => b.onclick = () => { const it = selVisual(); if (!it) return toast('Chọn clip video/ảnh trước'); pushHist(); if (!b.dataset.flt) delete it.filter; else it.filter = { id: b.dataset.flt, amount: (it.filter && it.filter.amount) ?? 100 }; mediaTab = 'adj'; $('#props').dataset.for = ''; markDirty(); renderLib(); });
  const oa = el.querySelector('[data-openadj]'); if (oa) oa.onclick = () => { mediaTab = 'adj'; $('#props').dataset.for = ''; renderProps(); };
  const si = el.querySelector('#srtIn'); if (si) si.onchange = async e => { const f = e.target.files[0]; e.target.value = ''; if (f) importSrt(await f.text(), $('#srtAtCur').checked); };
}
function addSticker(o) {
  pushHist();
  const it = Object.assign({ id: uid(), kind: 'text', start: time, dur: 3, x: 0.5, y: 0.4, stroke: false, bold: false }, o);
  items().push(it); sel = it.id; propTab = 'text'; markDirty();
}
async function addSfx(type) {
  const label = (SFX.find(x => x[0] === type) || [, type])[1], name = `Âm thanh - ${label}.wav`;
  let m = media.find(x => x.name === name && x.kind === 'audio');
  if (!m) {
    const blob = await makeSfx(type), f = new File([blob], name, { type: 'audio/wav' });
    try { m = await S.addMedia(f, { kind: 'audio', duration: await new Promise(r => { const a = new Audio(URL.createObjectURL(blob)); a.onloadedmetadata = () => r(a.duration); a.onerror = () => r(1); }) }); media.push(m); }
    catch (err) { return toast(err.message); }
  }
  addMedia(m); toast('Đã thêm âm thanh ' + label);
}
function importSrt(txt, atCur) {
  const cues = parseSrt(txt.replace(/^WEBVTT.*\n/, ''));
  if (!cues.length) return toast('File không có câu phụ đề nào');
  pushHist(); const off = atCur ? time - cues[0].start : 0;
  for (const c of cues) items().push(Object.assign({ id: uid(), kind: 'text', start: Math.max(0, c.start + off), dur: Math.max(0.2, c.end - c.start), x: 0.5, strokeColor: '#000000', bgColor: '#152758' }, TEXT_PRESETS.sub, { text: c.text, font: 'Montserrat', y: 0.74, size: 58 }));
  sel = null; markDirty(); toast(`Đã thêm ${cues.length} câu phụ đề`);
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
function getEl2(mid) { // phần tử phụ để clip trước kéo dài bên dưới khi chuyển cảnh
  const key = mid + '#u'; if (els[key]) return els[key];
  const m = mById(mid); if (!m) return null;
  if (m.kind === 'image') return getEl(mid);
  const el = document.createElement('video'); el.crossOrigin = 'anonymous'; el.preload = 'auto'; el.muted = true; el.playsInline = true;
  el.src = mediaUrl(m); $('#mediaPool').appendChild(el); return els[key] = el;
}
function syncMedia(el, target, shouldPlay, vol, rate = 1, keepPitch = true) {
  const g = gains.get(el); if (g) g.gain.value = vol; else el.volume = clamp(vol, 0, 1);
  if (el.playbackRate !== rate) { try { el.playbackRate = rate; } catch {} }
  if (el.preservesPitch !== keepPitch) { try { el.preservesPitch = keepPitch; } catch {} }
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
function drawFit(src, sw, sh, it, W, H, st = { a: 1, dx: 0, dy: 0, sc: 1 }, main = true) {
  if (!sw || !sh) return;
  const b = fitBox(sw, sh, it, W, H); if (main) mediaBoxes.set(it.id, b);
  const a = effAdj(it), on = adjActive(a), alpha = (it.opacity ?? 1) * st.a;
  if (alpha <= 0.001) return;
  const cx = b.cx + st.dx * W, cy = b.cy + st.dy * H;
  ctx.save(); ctx.globalAlpha = alpha; ctx.translate(cx, cy); ctx.rotate(b.rot * Math.PI / 180); ctx.scale(st.sc, st.sc);
  if (on) ctx.filter = cssFilter(a);
  ctx.drawImage(src, -b.w / 2, -b.h / 2, b.w, b.h); ctx.restore();
  if (on) drawAdjOverlay(ctx, { cx, cy, w: b.w * st.sc, h: b.h * st.sc, rot: b.rot }, a, alpha);
}
const isVis = i => i.kind === 'video' || i.kind === 'image';
function mainList() { return items().filter(i => isVis(i) && !hiddenItem(i)).sort((a, b) => a.start - b.start); }
function nextOf(it, list = mainList()) { const e = it.start + it.dur; return list.find(o => o !== it && Math.abs(o.start - e) < 0.05); }
function srcTime(it, tl) { const m = mById(it.mediaId), t = (it.in || 0) + tl * spd(it); return m && m.duration ? Math.min(t, Math.max(0, m.duration - 0.04)) : t; }
function fadeGain(it, tl) {
  let g = 1; if (it.fadeIn > 0) g = Math.min(g, tl / it.fadeIn); if (it.fadeOut > 0) g = Math.min(g, (it.dur - tl) / it.fadeOut);
  return clamp(g, 0, 1);
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
  if (tl !== null && it.kf) it = kfApply(it, tl);
  const st = tl === null ? { a: 1, dx: 0, dy: 0, sc: 1, rot: 0, frac: 1 } : animState(it, tl);
  let lines = textCase(String(it.text || ''), it.caseMode).split('\n');
  if (st.frac < 1) { // gõ chữ: hiện dần từng ký tự
    let n = Math.floor(lines.join('').length * st.frac);
    lines = lines.map(l => { const c = l.slice(0, Math.max(0, n)); n -= l.length; return c; });
  }
  const size = it.size || 64, lh = size * (it.lineH || 1.22), fam = it.font || 'Montserrat';
  if (it.shape) { // nhãn dán hình vẽ
    const wide = it.shape === 'arrow' || it.shape === 'underline', bw = size * (wide ? 2.6 : 1.6), bh = size * (it.shape === 'underline' ? 0.6 : wide ? 0.9 : 1.6);
    if (g === ctx) textBoxes.set(it.id, { cx: it.x * W, cy: it.y * H, w: bw, h: bh, rot: it.rot || 0 });
    g.save(); g.globalAlpha = (it.opacity ?? 1) * st.a;
    g.translate(it.x * W + st.dx * W, it.y * H + st.dy * H); g.rotate(((it.rot || 0) + st.rot) * Math.PI / 180); g.scale(st.sc, st.sc);
    if (it.shadow) { g.shadowColor = 'rgba(0,0,0,.55)'; g.shadowBlur = 10; g.shadowOffsetY = 4; }
    drawShape(g, it.shape, bw, bh, it.color || '#C1272C', Math.max(2, size * (it.strokeW ?? 0.1)));
    g.restore(); return;
  }
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
  const list = mainList(), specs = new Map(list.map(i => [i.id, clipAnimSpec(i, nextOf(i, list))]));
  for (const it of items()) {
    if ((it.kind === 'video' || it.kind === 'audio') && act(it)) {
      const el = getEl(it.mediaId); if (!el) continue; const tl = t - it.start;
      syncMedia(el, srcTime(it, tl), playing, mutedItem(it) ? 0 : kfVal(it, 'volume', tl) * fadeGain(it, tl), spd(it), !it.pitch); used.add(el);
    }
  }
  // clip đang hiện + clip trước kéo dài bên dưới (chuyển cảnh)
  for (const it of list) {
    const sp = specs.get(it.id), tl = t - it.start;
    if (tl < 0 || tl >= it.dur + sp.ext) continue;
    const under = tl >= it.dur;
    let el = under && it.kind === 'video' ? getEl2(it.mediaId) : getEl(it.mediaId); if (!el) continue;
    if (under && it.kind === 'video') { syncMedia(el, srcTime(it, tl), playing, 0, spd(it)); used.add(el); }
    const st = under ? { a: 1, dx: 0, dy: 0, sc: 1 } : clipState(it, tl, sp);
    const r = kfApply(it, Math.min(tl, it.dur));
    if (it.kind === 'video' && el.readyState >= 2) drawFit(el, el.videoWidth, el.videoHeight, r, W, H, st, !under);
    if (it.kind === 'image' && el.complete) drawFit(el, el.naturalWidth, el.naturalHeight, r, W, H, st, !under);
  }
  // lóe trắng
  for (const it of list) {
    if (!it.trans || it.trans.type !== 'white') continue;
    const d2 = (it.trans.dur || 0.6) / 2, k = 1 - Math.abs(t - it.start) / d2;
    if (k > 0) { ctx.save(); ctx.fillStyle = `rgba(255,255,255,${k.toFixed(3)})`; ctx.fillRect(0, 0, W, H); ctx.restore(); }
  }
  // hiệu ứng video
  items().filter(i => i.kind === 'fx' && act(i) && !hiddenItem(i)).sort((a, b) => a.start - b.start).forEach(i => drawVfx(ctx, i.type, t - i.start, W, H));
  // chuẩn bị trước clip sắp tới để chuyển cảnh mượt
  for (const it of items()) {
    if ((it.kind === 'video' || it.kind === 'audio') && it.start > t && it.start - t < 1.5) {
      const el = getEl(it.mediaId);
      if (el && !used.has(el) && !el.seeking && Math.abs(el.currentTime - (it.in || 0)) > 0.1) { el.pause(); el.currentTime = it.in || 0; }
      if (el) used.add(el);
    }
    if (it.kind === 'video' && specs.get(it.id) && specs.get(it.id).ext) {
      const e = it.start + it.dur; if (e > t && e - t < 1.5) { const el = getEl2(it.mediaId); if (el && !used.has(el)) { const tg = srcTime(it, it.dur); if (!el.seeking && Math.abs(el.currentTime - tg) > 0.1) { el.pause(); el.currentTime = tg; } used.add(el); } }
    }
  }
  Object.values(els).forEach(el => { if (el instanceof HTMLMediaElement && !used.has(el) && !el.paused) el.pause(); });
  textBoxes.clear();
  items().filter(i => i.kind === 'text' && act(i) && !hiddenItem(i)).sort((a, b) => (a.st ? 1 : 0) - (b.st ? 1 : 0) || a.start - b.start).forEach(i => drawText(i, W, H, ctx, t - i.start));
  updateSelBox();
  if ($('#safeChk').checked && !exporting) drawSafeZone(W, H);
}
let lastTs = 0, lastPropT = -1, lastPropR = 0;
function frame(ts) {
  const dt = lastTs ? (ts - lastTs) / 1000 : 0; lastTs = ts;
  if (playing && P) {
    time += Math.min(dt, 0.1);
    const d = projDur();
    if (exporting) setExProg(time / d);
    if (time >= d) { time = d; setPlaying(false); if (exporting) finishExport(); }
  }
  if (P && !nativeBusy && !$('#editor').classList.contains('hidden')) {
    draw(); updatePlayhead();
    const si = sel && selItem();
    if (si && hasKf(si) && Math.abs(time - lastPropT) > 0.001 && ts - lastPropR > (playing ? 250 : 60)) { lastPropR = ts; $('#props').dataset.for = ''; renderProps(); }
  }
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
  const tl0 = time - hit.start, ox = kfVal(hit, 'x', tl0), oy = kfVal(hit, 'y', tl0), snap = JSON.stringify(P.data); let moved = false;
  cv.setPointerCapture(e.pointerId);
  const mv = ev => {
    const q = canvasPt(ev), dx = (q.x - p.x) / cv.width, dy = (q.y - p.y) / cv.height; moved = true;
    let nx = ox + dx, ny = oy + dy;
    const cx0 = hit.kind === 'text' ? 0.5 : 0, cy0 = hit.kind === 'text' ? 0.5 : 0; // hít vào giữa
    if (Math.abs(nx - cx0) < 0.015) nx = cx0; if (Math.abs(ny - cy0) < 0.015) ny = cy0;
    setProp(hit, 'x', nx); setProp(hit, 'y', ny);
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
  const d0 = Math.hypot(p0.x - c.x, p0.y - c.y) || 1, a0 = Math.atan2(p0.y - c.y, p0.x - c.x), tl0 = time - it.start, rot0 = kfVal(it, 'rot', tl0);
  const size0 = kfVal(it, 'size', tl0) || 64, scale0 = kfVal(it, 'scale', tl0) || 1, isRot = h.classList.contains('rot');
  selBox.setPointerCapture(e.pointerId);
  const mv = ev => {
    const q = canvasPt(ev);
    if (isRot) { let r = rot0 + (Math.atan2(q.y - c.y, q.x - c.x) - a0) * 180 / Math.PI; r = ((r + 540) % 360) - 180; if (Math.abs(r) < 3) r = 0; if (Math.abs(Math.abs(r) - 90) < 3) r = Math.sign(r) * 90; setProp(it, 'rot', Math.round(r)); }
    else { const f = Math.max(0.05, Math.hypot(q.x - c.x, q.y - c.y) / d0); if (it.kind === 'text') setProp(it, 'size', Math.round(clamp(size0 * f, 8, 800))); else setProp(it, 'scale', +clamp(scale0 * f, 0.05, 10).toFixed(3)); }
  };
  const up = () => { selBox.removeEventListener('pointermove', mv); selBox.removeEventListener('pointerup', up); pushHist(snap); $('#props').dataset.for = ''; markDirty(); };
  selBox.addEventListener('pointermove', mv); selBox.addEventListener('pointerup', up);
});

/* ================= TIMELINE ================= */
function renderTrackHeads() {
  if (!P) return;
  $('#tlLabels').innerHTML = visTracks().map(t => { const s = trk(t.id); return `<div class="th" data-t="${t.id}"><span class="tn">${t.name}</span><span class="tb">
    <button class="${s.lock ? 'on' : ''}" data-a="lock" title="${s.lock ? 'Mở khóa' : 'Khóa'} track">${s.lock ? '🔒' : '🔓'}</button>
    <button class="${s.hide ? 'on' : ''}" data-a="hide" title="${s.hide ? 'Hiện' : 'Ẩn'} track">${s.hide ? '🙈' : '👁'}</button>
    ${t.id === 'video' || t.id === 'audio' ? `<button class="${s.mute ? 'on' : ''}" data-a="mute" title="${s.mute ? 'Bật' : 'Tắt'} tiếng">${s.mute ? '🔇' : '🔊'}</button>` : ''}</span></div>`; }).join('');
  $$('#tlLabels button').forEach(b => b.onclick = () => { pushHist(); const s = trk(b.closest('.th').dataset.t); s[b.dataset.a] = !s[b.dataset.a]; markDirty(); });
}
$('#zoom').oninput = e => { zoom = +e.target.value; renderTimeline(); };
$('#zoomIn').onclick = () => { zoom = Math.min(300, Math.round(zoom * 1.25)); $('#zoom').value = zoom; renderTimeline(); };
$('#zoomOut').onclick = () => { zoom = Math.max(10, Math.round(zoom / 1.25)); $('#zoom').value = zoom; renderTimeline(); };
function renderAll() { renderTrackHeads(); renderTimeline(); renderProps(); if (['trans', 'filter', 'adjust'].includes(assetTab) && !$('#tab-lib').classList.contains('hidden')) renderLib(); $('#undoBtn').disabled = !hist.length; $('#redoBtn').disabled = !fut.length; }
function renderTimeline() {
  if (!P) return;
  const total = Math.max(projDur() + 15, 30), W = total * zoom;
  $('#tlContent').style.width = W + 'px';
  const steps = [0.5, 1, 2, 5, 10, 15, 30, 60, 120], step = steps.find(s => s * zoom >= 70) || 300;
  let rh = ''; for (let t = 0; t <= total; t += step) rh += `<div class="tick" style="left:${t * zoom}px">${fmt(t).replace(/\.\d$/, '')}</div>`;
  $('#ruler').innerHTML = rh;
  const tracks = $('#tracks'); tracks.innerHTML = '';
  for (const tr of visTracks()) {
    const row = document.createElement('div'); row.className = 'track'; row.dataset.track = tr.id;
    const lanes = [], laneOf = new Map(); // clip chồng nhau trên cùng track xếp thành nhiều hàng
    for (const it of items().filter(i => trackOf(i) === tr.id).sort((a, b) => a.start - b.start)) {
      let l = lanes.findIndex(e => e <= it.start + 0.001); if (l < 0) { l = lanes.length; lanes.push(0); }
      lanes[l] = it.start + it.dur; laneOf.set(it.id, l);
    }
    const nL = Math.max(1, lanes.length); row.style.height = (nL * 56 + (nL - 1) * 4) + 'px';
    const lab = $(`#tlLabels .th[data-t="${tr.id}"]`); if (lab) lab.style.height = row.style.height;
    for (const it of items().filter(i => trackOf(i) === tr.id)) {
      const c = document.createElement('div'); c.style.top = (2 + laneOf.get(it.id) * 60) + 'px'; c.className = `clip ${it.kind}${it.id === sel ? ' sel' : ''}${hiddenItem(it) ? ' off' : ''}`; c.dataset.id = it.id;
      c.style.left = it.start * zoom + 'px'; c.style.width = Math.max(8, it.dur * zoom) + 'px';
      const m = it.mediaId && mById(it.mediaId);
      if (m && m.thumb) c.style.backgroundImage = `url(${m.thumb})`;
      const label = document.createElement('span');
      label.textContent = it.kind === 'fx' ? '✨ ' + vfxName(it.type) : it.shape ? '◆ ' + ((SHAPES.find(x => x[0] === it.shape) || [, 'Hình'])[1]) : it.kind === 'text' ? (it.text || '').replace(/\n/g, ' ') : (m ? m.name : 'Thiếu file');
      c.append(label);
      if (spd(it) !== 1 && it.kind !== 'text' && it.kind !== 'fx') c.insertAdjacentHTML('afterbegin', `<b class="spd">${+spd(it).toFixed(2)}×</b>`);
      if (it.trans && it.trans.type && it.trans.type !== 'none') c.insertAdjacentHTML('afterbegin', `<i class="trmk" title="Chuyển cảnh: ${(TRANSITIONS.find(x => x[0] === it.trans.type) || [, ''])[1]}">⧓</i>`);
      if (it.filter || (it.adj && adjActive(it.adj))) c.insertAdjacentHTML('afterbegin', '<i class="fxmk" title="Đã chỉnh màu">🎨</i>');
      c.insertAdjacentHTML('beforeend', '<div class="h l"></div><div class="h r"></div>');
      if (it.id === sel && hasKf(it)) [...new Set(Object.values(it.kf).flat().map(x => x.t))].forEach(t => c.insertAdjacentHTML('beforeend', `<i class="kfd" style="left:${t * zoom}px"></i>`));
      row.appendChild(c);
    }
    tracks.appendChild(row);
  }
  $('#tdur').textContent = fmt(projDur()); $('#magnetBtn').classList.toggle('on', !!P.data.magnet);
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
  if (sel !== it.id) { sel = it.id; renderProps(); $$('.clip').forEach(c => c.classList.toggle('sel', c === clip)); if (['trans', 'filter', 'adjust'].includes(assetTab)) renderLib(); }
  const mode = e.target.classList.contains('l') ? 'l' : e.target.classList.contains('r') ? 'r' : 'move';
  const snapStr = JSON.stringify(P.data), o = { ...it }, x0 = e.clientX, pts = snapPoints(it.id), kf0 = it.kf ? JSON.parse(JSON.stringify(it.kf)) : null;
  const m = it.mediaId && mById(it.mediaId), maxSrc = it.kind === 'video' || it.kind === 'audio' ? (m?.duration || Infinity) : Infinity;
  let moved = false; clip.setPointerCapture(e.pointerId);
  const mv = ev => {
    const dx = (ev.clientX - x0) / zoom; if (Math.abs(ev.clientX - x0) > 2) moved = true; if (!moved) return;
    if (mode === 'move') {
      let s = Math.max(0, o.start + dx); const se = snap(s + o.dur, pts); s = snap(s, pts);
      if (s === Math.max(0, o.start + dx) && se !== s + o.dur) s = se - o.dur;
      it.start = Math.max(0, s);
    } else if (mode === 'l') {
      const minStart = it.kind === 'video' || it.kind === 'audio' ? Math.max(0, o.start - (o.in || 0) / spd(o)) : 0;
      const ns = clamp(snap(o.start + dx, pts), minStart, o.start + o.dur - 0.1), d = ns - o.start;
      it.start = ns; it.in = Math.max(0, (o.in || 0) + d * spd(o)); it.dur = o.dur - d;
      if (kf0) { if (d >= 0) it.kf = kfSplit({ kf: kf0 }, d)[1]; else it.kf = kfShift(kf0, d); }
    } else {
      it.dur = clamp(snap(o.start + o.dur + dx, pts) - o.start, 0.1, (maxSrc - (o.in || 0)) / spd(o));
    }
    clip.style.left = it.start * zoom + 'px'; clip.style.width = Math.max(8, it.dur * zoom) + 'px';
  };
  const up = () => { clip.removeEventListener('pointermove', mv); clip.removeEventListener('pointerup', up); if (moved) { pushHist(snapStr); markDirty(); } };
  clip.addEventListener('pointermove', mv); clip.addEventListener('pointerup', up);
});

/* ---- công cụ ---- */
function selItem() { return items().find(i => i.id === sel); }
/** Ghi thuộc tính: nếu thuộc tính đã có keyframe thì ghi/cập nhật keyframe tại con trỏ (giống CapCut) */
function setProp(it, k, v) { if (kfList(it, k).length) kfSet(it, k, time - it.start, v); else it[k] = v; }
const kfKind = it => it.kind === 'text' ? 'text' : it.kind;
function split() {
  const it = selItem(); if (!it) return toast('Chọn một clip trước');
  if (time <= it.start + 0.05 || time >= it.start + it.dur - 0.05) return toast('Đặt con trỏ thời gian vào giữa clip');
  pushHist();
  const a = time - it.start, b = JSON.parse(JSON.stringify({ ...it, id: uid(), start: time, in: (it.in || 0) + a * spd(it), dur: it.dur - a }));
  const [kL, kR] = kfSplit(it, a); if (kL) { it.kf = kL; b.kf = kR; }
  delete b.trans; if (b.anim) delete b.anim.in; if (it.anim) delete it.anim.out; if (b.fadeIn) b.fadeIn = 0; if (it.fadeOut) it.fadeOut = 0;
  it.dur = a; items().push(b); sel = b.id; markDirty();
}
function cutSide(left) {
  const it = selItem(); if (!it) return toast('Chọn một clip trước');
  if (time <= it.start + 0.05 || time >= it.start + it.dur - 0.05) return toast('Đặt con trỏ thời gian vào giữa clip');
  pushHist(); const a = time - it.start;
  const [kL, kR] = kfSplit(it, a);
  if (left) { if (it.kind !== 'image' && it.kind !== 'text' && it.kind !== 'fx') it.in = (it.in || 0) + a * spd(it); it.start = time; it.dur -= a; delete it.trans; if (kR) it.kf = kR; }
  else { it.dur = a; if (kL) it.kf = kL; }
  markDirty();
}
function addKfAll() {
  const it = selItem(); if (!it || !KF_PROPS[kfKind(it)]) return toast('Chọn một clip trước');
  const tl = time - it.start; if (tl < 0 || tl > it.dur) return toast('Đưa con trỏ thời gian vào trong clip');
  pushHist(); for (const k of KF_PROPS[kfKind(it)]) kfSet(it, k, tl, kfVal(it, k, tl)); $('#props').dataset.for = ''; markDirty(); toast('Đã thêm khung hình chính');
}
$('#kfBtn').onclick = addKfAll;
$('#delLeftBtn').onclick = () => cutSide(true); $('#delRightBtn').onclick = () => cutSide(false);
$('#magnetBtn').onclick = () => { pushHist(); P.data.magnet = !P.data.magnet; toast(P.data.magnet ? 'Bật nam châm: clip video tự nối sát nhau' : 'Tắt nam châm'); markDirty(); };
function del() { const it = selItem(); if (!it) return; pushHist(); P.data.items = items().filter(i => i.id !== it.id); sel = null; markDirty(); }
function dup() { const it = selItem(); if (!it) return; pushHist(); const b = JSON.parse(JSON.stringify({ ...it, id: uid(), start: trackOf(it) === 'video' ? trackEnd('video') : it.start + it.dur })); items().push(b); sel = b.id; markDirty(); }
$('#splitBtn').onclick = split; $('#delBtn').onclick = del; $('#dupBtn').onclick = dup;
addEventListener('keydown', e => {
  if ($('#editor').classList.contains('hidden') || /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
  const k = e.key.toLowerCase();
  if (k === ' ') { e.preventDefault(); setPlaying(!playing); }
  else if (k === 's' && !e.ctrlKey) split();
  else if (k === 'q' && !e.ctrlKey) cutSide(true);
  else if (k === 'k' && !e.ctrlKey) addKfAll();
  else if (k === 'w' && !e.ctrlKey) cutSide(false);
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
let propTab = 'text', propSub = 'basic', animSub = 'in', mediaTab = 'video';
let kfCtx = null;
function kfBtns(key) {
  const it = kfCtx; if (!it || !(KF_PROPS[kfKind(it)] || []).includes(key)) return '';
  const tl = time - it.start, L = kfList(it, key), on = L.some(x => Math.abs(x.t - tl) < 0.02);
  const prev = L.some(x => x.t < tl - 0.02), next = L.some(x => x.t > tl + 0.02);
  return `<span class="kf"><button data-kfp="${key}" ${prev ? '' : 'disabled'} title="Khung hình chính trước">‹</button><button class="kd ${on ? 'on' : L.length ? 'has' : ''}" data-kft="${key}" title="${on ? 'Xóa' : 'Thêm'} khung hình chính">${on ? '◆' : '◇'}</button><button data-kfn="${key}" ${next ? '' : 'disabled'} title="Khung hình chính sau">›</button></span>`;
}
function slider(label, key, min, max, step, val, unit = '', fn = '') {
  if (kfCtx && kfList(kfCtx, key).length) { const r = kfVal(kfCtx, key, time - kfCtx.start); val = fn ? FN[fn][0](r) : r; }
  const v = +(+val).toFixed(4), f = fn ? ` data-fn="${fn}"` : '';
  return `<div class="prop"><label>${label}${kfBtns(key)}<span class="numw"><input type="number" class="num" data-k="${key}" data-num${f} min="${min}" max="${max}" step="${step}" value="${v}">${unit}</span></label>
    <input type="range" data-k="${key}" data-num${f} min="${min}" max="${max}" step="${step}" value="${v}"></div>`;
}
const toDb = v => v <= 0.001 ? -60 : Math.round(20 * Math.log10(v) * 10) / 10;
/* bộ chuyển đổi giá trị hiển thị <-> dữ liệu: [đọc, ghi] */
const FN = {
  pct: [v => v * 100, v => v / 100],
  px: [v => v * dims()[0], v => v / dims()[0]], py: [v => v * dims()[1], v => v / dims()[1]],
  db: [toDb, v => v <= -60 ? 0 : Math.pow(10, v / 20)],
};
const secHead = (t, keys) => `<div class="adj-g sec">${t}<span class="sec-btns"><button data-secreset="${keys}" title="Đặt lại">↺</button><button data-seckf="${keys}" title="Thêm khung hình chính cho cả mục">◇</button></span></div>`;
function mediaProps(it) {
  const tabs = it.kind === 'video' ? [['video', 'Video'], ['audio', 'Âm thanh'], ['speed', 'Tốc độ'], ['canim', 'Hiệu ứng động'], ['adj', 'Điều chỉnh']]
    : it.kind === 'image' ? [['video', 'Ảnh'], ['canim', 'Hiệu ứng động'], ['adj', 'Điều chỉnh']] : [['audio', 'Âm thanh'], ['speed', 'Tốc độ']];
  if (!tabs.some(t => t[0] === mediaTab)) mediaTab = tabs[0][0];
  let h = `<div class="ptabs scroll">${tabs.map(([k, l]) => `<button class="${mediaTab === k ? 'on' : ''}" data-mtab="${k}">${l}</button>`).join('')}</div>`;
  const T = mediaTab;
  if (T === 'video') {
    h += `${secHead('Biến đổi', 'scale,x,y,rot')}${slider('Tỷ lệ', 'scale', 5, 500, 1, (it.scale || 1) * 100, '%', 'pct')}
      ${slider('Vị trí X', 'x', -2000, 2000, 1, Math.round((it.x || 0) * dims()[0]), 'px', 'px')}${slider('Vị trí Y', 'y', -3000, 3000, 1, Math.round((it.y || 0) * dims()[1]), 'px', 'py')}
      ${slider('Xoay', 'rot', -180, 180, 1, it.rot || 0, '°')}
      <div class="prop"><label>Căn chỉnh</label><div class="align-row">
        <button class="btn" data-align="l" title="Sát trái">⇤</button><button class="btn" data-align="c" title="Giữa ngang">↔</button><button class="btn" data-align="r" title="Sát phải">⇥</button>
        <button class="btn" data-align="t" title="Sát trên">⤒</button><button class="btn" data-align="m" title="Giữa dọc">↕</button><button class="btn" data-align="b" title="Sát dưới">⤓</button></div></div>
      <div class="prop row2"><label>Khung</label>${segBtns('fit', it.fit || 'contain', [['contain', 'Vừa khung'], ['cover', 'Lấp đầy']])}</div>
      ${secHead('Hòa trộn', 'opacity')}${slider('Độ mờ', 'opacity', 0, 100, 1, (it.opacity ?? 1) * 100, '%', 'pct')}
      <div class="prop"><button class="btn block" data-reset>↺ Đặt lại vị trí, cỡ, góc xoay</button></div>`;
  } else if (T === 'audio') {
    h += `${secHead('Cơ bản', 'volume')}${slider('Âm lượng', 'volume', -60, 12, 0.1, toDb(it.volume ?? 1), 'dB', 'db')}
      ${slider('Rõ dần', 'fadeIn', 0, Math.min(10, it.dur / 2), 0.1, it.fadeIn || 0, 's')}${slider('Mờ dần', 'fadeOut', 0, Math.min(10, it.dur / 2), 0.1, it.fadeOut || 0, 's')}
      <div class="prop row2"><label>Tắt tiếng clip</label><label class="switch"><input type="checkbox" data-mute ${(it.volume ?? 1) <= 0.001 ? 'checked' : ''}><span></span></label></div>`;
  } else if (T === 'speed') {
    const src = it.dur * spd(it);
    h += `${slider('Tốc độ', 'speed', 0.1, 10, 0.05, spd(it), '×')}
      <div class="seg wrap">${[0.5, 1, 1.5, 2, 3, 5].map(v => `<button class="btn ${Math.abs(spd(it) - v) < 0.001 ? 'on' : ''}" data-speed="${v}">${v}×</button>`).join('')}</div>
      <p class="muted small">Thời lượng: ${src.toFixed(1)}s → <b>${it.dur.toFixed(1)}s</b></p>
      <div class="prop row2"><label>Thay đổi cao độ</label><label class="switch"><input type="checkbox" data-check="pitch" ${it.pitch ? 'checked' : ''}><span></span></label></div>
      <p class="muted small">Tắt: giữ nguyên giọng khi tua nhanh/chậm. Bật: giọng cao lên khi nhanh, trầm xuống khi chậm.</p>`;
  } else if (T === 'canim') {
    if (animSub === 'loop') animSub = 'in';
    const A = it.anim || {}, cur = (A[animSub] && A[animSub].type) || 'none', tr = it.trans || {};
    h += `<div class="psub"><button class="${animSub === 'in' ? 'on' : ''}" data-asub="in">Vào</button><button class="${animSub === 'out' ? 'on' : ''}" data-asub="out">Ra</button></div>
      <div class="anim-grid">${CLIP_ANIMS.map(([v, l]) => `<button class="anim-c ${cur === v ? 'on' : ''}" data-canim="${v}"><span class="anim-demo">${v === 'none' ? '⊘' : '▣'}</span><small>${l}</small></button>`).join('')}</div>
      ${cur !== 'none' ? slider('Thời lượng', `anim.${animSub}.dur`, 0.1, 3, 0.05, (A[animSub] && A[animSub].dur) || 0.5, 's') : ''}
      <div class="adj-g">Chuyển cảnh vào clip này</div>
      <div class="anim-grid"><button class="anim-c ${!tr.type || tr.type === 'none' ? 'on' : ''}" data-trans="none"><span class="anim-demo">⊘</span><small>Không có</small></button>
        ${TRANSITIONS.map(([v, l, ic]) => `<button class="anim-c ${tr.type === v ? 'on' : ''}" data-trans="${v}"><span class="anim-demo">${ic}</span><small>${l}</small></button>`).join('')}</div>
      ${tr.type && tr.type !== 'none' ? slider('Thời lượng chuyển cảnh', 'trans.dur', 0.2, 2, 0.05, tr.dur || 0.6, 's') : ''}
      <p class="muted small">Chuyển cảnh nối clip này với clip ngay trước nó trên track Video. Có thể kéo từ mục 🔀 Chuyển cảnh bên trái.</p>`;
  } else if (T === 'adj') {
    const f = it.filter && filterById(it.filter.id);
    h += `<div class="adj-g">Bộ lọc</div>${f ? `<div class="prop row2"><label>${f[1]}</label><button class="btn sm" data-nofilter>Bỏ bộ lọc</button></div>${slider('Cường độ', 'filter.amount', 0, 100, 1, it.filter.amount ?? 100)}` : '<p class="muted small">Chưa có. Chọn ở mục 🎨 Bộ lọc bên trái.</p>'}`;
    for (const [g, keys] of ADJ) h += `<div class="adj-g">${g}</div>` + keys.map(([k, l]) => slider(l, 'adj.' + k, ADJ_MIN0.has(k) ? 0 : -100, 100, 1, (it.adj && it.adj[k]) || 0)).join('');
    h += `<div class="prop"><button class="btn block" data-adjreset>↺ Đặt lại màu</button></div>`;
  }
  return h;
}
function stickerProps(it) {
  return `${slider('Kích thước', 'size', 10, 800, 1, it.size || 120)}
    ${it.shape ? `<div class="prop"><label>Màu</label>${colorCtl('color', it.color || '#C1272C')}</div>${slider('Độ dày nét', 'strokeW', 0.03, 0.3, 0.01, it.strokeW ?? 0.1)}` : ''}
    ${slider('Độ mờ', 'opacity', 0, 100, 1, (it.opacity ?? 1) * 100, '%', 'pct')}${slider('Xoay', 'rot', -180, 180, 1, it.rot || 0, '°')}
    <div class="prop row2"><label>Bóng đổ</label><label class="switch"><input type="checkbox" data-check="shadow" ${it.shadow ? 'checked' : ''}><span></span></label></div>`;
}
const segBtns = (key, cur, opts) => `<div class="seg">${opts.map(([v, l, t]) => `<button class="btn ${String(cur) === String(v) ? 'on' : ''}" data-set="${key}" data-v="${v}" title="${t || ''}">${l}</button>`).join('')}</div>`;
function renderProps() {
  const box = $('#props'), it = selItem();
  if (!it) { box.dataset.for = ''; box.innerHTML = '<div class="props-empty"><div class="empty-ic">👆</div><b>Chưa chọn gì</b><p class="muted small">Bấm một clip trên timeline hoặc trên khung hình để chỉnh.</p><p class="muted small">Space phát/dừng · S tách · Delete xóa · Ctrl+Z hoàn tác</p></div>'; return; }
  if (box.dataset.for === it.id && box.contains(document.activeElement) && document.activeElement !== document.body && document.activeElement.tagName !== 'BUTTON') return; // đang gõ
  box.dataset.for = it.id; kfCtx = it; lastPropT = time;
  let h = '';
  if (it.kind === 'fx') {
    h += `<div class="ptabs"><button class="on">Hiệu ứng</button></div><div class="anim-grid">${VFX.map(([v, l, ic]) => `<button class="anim-c ${it.type === v ? 'on' : ''}" data-set="type" data-v="${v}"><span class="anim-demo">${ic}</span><small>${l}</small></button>`).join('')}</div>
      <p class="muted small">Hiệu ứng áp lên mọi video, ảnh bên dưới trong khoảng thời gian của nó. Kéo hai đầu trên timeline để đổi độ dài.</p>`;
  }
  if (it.kind === 'text') {
    if (!['text', 'anim'].includes(propTab)) propTab = 'text';
    h += `<div class="ptabs"><button class="${propTab === 'text' ? 'on' : ''}" data-ptab="text">${it.st ? 'Nhãn dán' : 'Văn bản'}</button><button class="${propTab === 'anim' ? 'on' : ''}" data-ptab="anim">Hiệu ứng động</button></div>`;
    if (propTab === 'text' && it.st) h += stickerProps(it);
    else if (propTab === 'text') {
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
        h += `${secHead('Vị trí & xoay', 'x,y,rot,size')}${slider('Vị trí X', 'x', 0, 4000, 1, Math.round((it.x ?? 0.5) * dims()[0]), 'px', 'px')}${slider('Vị trí Y', 'y', 0, 4000, 1, Math.round((it.y ?? 0.5) * dims()[1]), 'px', 'py')}
          ${slider('Giãn chữ', 'spacing', -10, 60, 1, it.spacing || 0, 'px')}${slider('Giãn dòng', 'lineH', 0.8, 2.5, 0.02, it.lineH || 1.22)}${slider('Xoay', 'rot', -180, 180, 1, it.rot || 0, '°')}`;
      }
    } else {
      const A = it.anim || {}, cur = (A[animSub] && A[animSub].type) || 'none';
      h += `<div class="psub"><button class="${animSub === 'in' ? 'on' : ''}" data-asub="in">Vào</button><button class="${animSub === 'out' ? 'on' : ''}" data-asub="out">Ra</button><button class="${animSub === 'loop' ? 'on' : ''}" data-asub="loop">Vòng lặp</button></div>
        <div class="anim-grid">${ANIMS[animSub].map(([v, l]) => `<button class="anim-c ${cur === v ? 'on' : ''}" data-anim="${v}"><span class="anim-demo an-${animSub}-${v}">${v === 'none' ? '⊘' : 'ABC'}</span><small>${l}</small></button>`).join('')}</div>
        ${cur !== 'none' ? (animSub === 'loop' ? slider('Tốc độ', 'anim.loop.speed', 0.25, 4, 0.05, (A.loop && A.loop.speed) || 1, '×') : slider('Thời lượng', `anim.${animSub}.dur`, 0.1, 3, 0.05, (A[animSub] && A[animSub].dur) || 0.5, 's')) : ''}`;
    }
  }
  if (it.kind === 'video' || it.kind === 'image' || it.kind === 'audio') h += mediaProps(it);
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
      const fn = FN[inp.dataset.fn];
      if (k === 'speed') { v = clamp(v, 0.1, 10); const m = mById(it.mediaId), old = spd(it); let nd = it.dur * old / v; if (m && m.duration) nd = Math.min(nd, (m.duration - (it.in || 0)) / v); it.dur = Math.max(0.1, nd); it.speed = v; if (P.data.magnet) packMain(); renderTimeline(); }
      else { const val = fn ? fn[1](v) : v; if (!k.includes('.') && kfList(it, k).length) kfSet(it, k, time - it.start, val); else setK(k, val); }
      if (k === 'filter.amount' || k.startsWith('adj.')) renderTimeline();
      box.querySelectorAll(`[data-k="${k}"]`).forEach(o => { if (o !== inp) o.value = v; });
      dirty = true; setSave('Đang lưu…'); clearTimeout(saveT); saveT = setTimeout(flushSave, 1200);
      if (k === 'text') renderTimeline();
    });
    inp.addEventListener('change', () => { if (pre) pushHist(pre); pre = null; $('#undoBtn').disabled = !hist.length; });
  });
  const mut = fn => { pushHist(); fn(); box.dataset.for = ''; markDirty(); };
  box.querySelectorAll('[data-ptab]').forEach(b => b.onclick = () => { propTab = b.dataset.ptab; box.dataset.for = ''; renderProps(); });
  const kfTimes = k => kfList(it, k).map(x => x.t);
  box.querySelectorAll('[data-kft]').forEach(b => b.onclick = () => mut(() => {
    const k = b.dataset.kft, tl = time - it.start; if (tl < 0 || tl > it.dur) return toast('Đưa con trỏ thời gian vào trong clip');
    if (kfList(it, k).some(x => Math.abs(x.t - tl) < 0.02)) kfDel(it, k, tl); else kfSet(it, k, tl, kfVal(it, k, tl));
  }));
  box.querySelectorAll('[data-kfp],[data-kfn]').forEach(b => b.onclick = () => {
    const nx = b.dataset.kfn !== undefined, tl = time - it.start, ts = kfTimes(b.dataset.kfp || b.dataset.kfn);
    const t = nx ? ts.find(x => x > tl + 0.02) : [...ts].reverse().find(x => x < tl - 0.02);
    if (t !== undefined) { setPlaying(false); time = it.start + t; box.dataset.for = ''; renderProps(); renderTimeline(); }
  });
  box.querySelectorAll('[data-seckf]').forEach(b => b.onclick = () => mut(() => {
    const tl = time - it.start; if (tl < 0 || tl > it.dur) return toast('Đưa con trỏ thời gian vào trong clip');
    for (const k of b.dataset.seckf.split(',')) kfSet(it, k, tl, kfVal(it, k, tl));
  }));
  box.querySelectorAll('[data-secreset]').forEach(b => b.onclick = () => mut(() => {
    const ks = b.dataset.secreset.split(','); for (const k of ks) { it[k] = KF_DEF[k]; if (it.kf) delete it.kf[k]; } if (it.kf && !Object.keys(it.kf).length) delete it.kf;
  }));
  box.querySelectorAll('[data-mtab]').forEach(b => b.onclick = () => { mediaTab = b.dataset.mtab; box.dataset.for = ''; renderProps(); });
  box.querySelectorAll('[data-speed]').forEach(b => b.onclick = () => mut(() => { const v = +b.dataset.speed, m = mById(it.mediaId); let nd = it.dur * spd(it) / v; if (m && m.duration) nd = Math.min(nd, (m.duration - (it.in || 0)) / v); it.dur = Math.max(0.1, nd); it.speed = v; }));
  box.querySelectorAll('[data-canim]').forEach(b => b.onclick = () => mut(() => { it.anim = it.anim || {}; const o = it.anim[animSub] = it.anim[animSub] || {}; o.type = b.dataset.canim; o.dur = o.dur || 0.5; if (o.type !== 'none') time = animSub === 'in' ? it.start : Math.max(it.start, it.start + it.dur - o.dur - 0.05); }));
  box.querySelectorAll('[data-trans]').forEach(b => b.onclick = () => mut(() => { const v = b.dataset.trans; if (v === 'none') delete it.trans; else { it.trans = { type: v, dur: (it.trans && it.trans.dur) || 0.6 }; time = Math.max(0, it.start - 0.5); } }));
  box.querySelectorAll('[data-align]').forEach(b => b.onclick = () => mut(() => {
    const [W, H] = dims(), bx = mediaBoxes.get(it.id); if (!bx) return toast('Đưa con trỏ thời gian vào clip này trước');
    const rad = (it.rot || 0) * Math.PI / 180, bw = Math.abs(bx.w * Math.cos(rad)) + Math.abs(bx.h * Math.sin(rad)), bh = Math.abs(bx.w * Math.sin(rad)) + Math.abs(bx.h * Math.cos(rad));
    const a = b.dataset.align;
    if (a === 'l') it.x = (bw / 2 - W / 2) / W; else if (a === 'r') it.x = (W / 2 - bw / 2) / W; else if (a === 'c') it.x = 0;
    else if (a === 't') it.y = (bh / 2 - H / 2) / H; else if (a === 'b') it.y = (H / 2 - bh / 2) / H; else if (a === 'm') it.y = 0;
  }));
  const nf = box.querySelector('[data-nofilter]'); if (nf) nf.onclick = () => mut(() => delete it.filter);
  const ar = box.querySelector('[data-adjreset]'); if (ar) ar.onclick = () => mut(() => { delete it.adj; delete it.filter; });
  const mu = box.querySelector('[data-mute]'); if (mu) mu.onchange = () => mut(() => { if (mu.checked) { it._vol = it.volume ?? 1; it.volume = 0; } else it.volume = it._vol || 1; });
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
  $('#nexRes').value = LS.get('exRes', '1080p'); $('#nexFps').value = LS.get('exFps', '30'); $('#nexQ').value = LS.get('exQ', 'high'); $('#nexFmt').value = LS.get('exFmt', 'h264');
  updateNexInfo();
}
function updateNexInfo() {
  const [w, h] = outSize($('#nexRes').value);
  const f = $('#nexFmt').value;
  $('#nexInfo').textContent = f === 'mp3' ? `Chỉ âm thanh · ${fmt(projDur())} · MP3 192 kbps` : `${w}×${h} · ${$('#nexFps').value} fps · ${fmt(projDur())} · MP4 (${f === 'h265' ? 'H.265' : 'H.264'} + AAC)`;
  $('#nexGo').textContent = f === 'mp3' ? 'Chọn nơi lưu và xuất âm thanh' : 'Chọn nơi lưu và xuất';
}
['#nexRes', '#nexFps', '#nexQ', '#nexFmt'].forEach(id => $(id).onchange = updateNexInfo);
$('#nexClose').onclick = () => { if (!nativeBusy) $('#nexModal').classList.add('hidden'); };
async function textSegments(outW, outH, fps, setStep) {
  const [W, H] = dims(), k = outW / W, segs = {}, tmp = [], dirs = [];
  const texts = items().filter(i => i.kind === 'text' && (String(i.text || '').trim() || i.shape) && !hiddenItem(i));
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
    if (hasKf(it)) {
      setStep(`Đang dựng chuyển động chữ ${n}/${texts.length}…`);
      list.push({ start: it.start, dur: it.dur, seq: await seq(it.id + '-kf-' + Date.now(), 0, Math.max(1, Math.round(it.dur * fps))), fps });
    } else if (!d.inD && !d.outD && !d.loop) {
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
  const fmtSel = $('#nexFmt').value, audioOnly = fmtSel === 'mp3';
  const name = ($('#nexName').value.trim() || 'video').replace(/[\\/:*?"<>|]+/g, '_') + (audioOnly ? '.mp3' : '.mp4');
  LS.set('exFmt', fmtSel); LS.set('exRes', $('#nexRes').value); LS.set('exFps', $('#nexFps').value); LS.set('exQ', $('#nexQ').value);
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
    const tp = audioOnly ? { segs: {}, tmp: [], dirs: [] } : await textSegments(outW, outH, fps, step); tempFiles.push(...tp.tmp); tempDirs.push(...tp.dirs);
    const list = mainList(), live = items().filter(i => !hiddenItem(i)).map(i => {
      const o = JSON.parse(JSON.stringify(mutedItem(i) ? { ...i, volume: 0 } : i));
      if (isVis(i)) { o.eadj = effAdj(i); o.ca = clipAnimSpec(i, nextOf(i, list)); if (i.trans && i.trans.type === 'white') o.flash = i.trans.dur || 0.6; }
      return o;
    });
    const [W, H] = dims();
    step('Đang dựng video bằng lõi FFmpeg…'); const tf = Date.now();
    window.electronAPI.onExportProgress(p => { bar(p); const el = (Date.now() - tf) / 1000; if (p > 0.02) step(`Đang dựng video… còn khoảng ${Math.max(1, Math.round(el / p - el))} giây`); });
    await window.electronAPI.exportStart({
      W, H, outW, outH, fps, crf: Q[0], preset: Q[1], codec: fmtSel, duration: projDur(), out,
      items: live.filter(i => i.kind !== 'fx'), fx: live.filter(i => i.kind === 'fx').map(i => ({ type: i.type, start: i.start, dur: i.dur })),
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

/* ================= BỐ CỤC (giống CapCut) ================= */
const LAYOUTS = [['default', 'Mặc định'], ['media', 'Tệp phương tiện'], ['gen', 'Tạo sinh'], ['props', 'Thuộc tính'], ['vertical', 'Dọc']];
const LAYOUT_ICON = { // sơ đồ nhỏ: [x,y,w,h] trên khung 20x14
  default: [[0, 0, 6, 8], [6, 0, 8, 8], [14, 0, 6, 8], [0, 8, 20, 6]], media: [[0, 0, 6, 14], [6, 0, 8, 8], [14, 0, 6, 8], [6, 8, 14, 6]],
  gen: [[0, 0, 8, 7], [0, 7, 8, 7], [8, 0, 12, 8], [8, 8, 12, 6]], props: [[0, 0, 7, 8], [7, 0, 7, 8], [14, 0, 6, 14], [0, 8, 14, 6]],
  vertical: [[0, 0, 7, 8], [7, 0, 6, 8], [13, 0, 7, 14], [0, 8, 13, 6]],
};
const layoutSvg = k => `<svg width="22" height="16" viewBox="-1 -1 22 16">${LAYOUT_ICON[k].map(([x, y, w, h]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="currentColor" stroke-width="1.2"/>`).join('')}</svg>`;
let layout = LS.get('layout', 'vertical');
function layoutSizes() { try { return JSON.parse(LS.get('layoutSizes', '{}')) || {}; } catch { return {}; } }
function applyLayout() {
  const ed = $('#editor'); ed.dataset.layout = layout;
  const sz = layoutSizes()[layout] || {};
  for (const v of ['--c0', '--c1', '--c2', '--tlh']) ed.style.removeProperty(v);
  for (const [k, v] of Object.entries(sz)) ed.style.setProperty(k, v);
  $('#layoutBtn').innerHTML = layoutSvg(layout) + ' ▾';
  setTimeout(placeSplitters, 30);
}
function saveSize(k, v) { const all = layoutSizes(); (all[layout] = all[layout] || {})[k] = v; LS.set('layoutSizes', JSON.stringify(all)); }
$('#layoutBtn').onclick = e => {
  e.stopPropagation(); let pop = $('.layout-pop'); if (pop) return pop.remove();
  pop = document.createElement('div'); pop.className = 'layout-pop';
  pop.innerHTML = LAYOUTS.map(([k, l]) => `${k === 'vertical' ? '<hr>' : ''}<button data-lay="${k}"><span class="ck">${k === layout ? '✓' : ''}</span>${layoutSvg(k)}${l}</button>`).join('') + '<hr><button data-lay="reset"><span class="ck"></span>↺ Đặt lại bố cục tùy chỉnh</button>';
  const r = $('#layoutBtn').getBoundingClientRect(); pop.style.left = Math.min(r.left, innerWidth - 230) + 'px'; $('#editor').appendChild(pop);
  pop.querySelectorAll('[data-lay]').forEach(b => b.onclick = () => {
    if (b.dataset.lay === 'reset') { const all = layoutSizes(); delete all[layout]; LS.set('layoutSizes', JSON.stringify(all)); }
    else { layout = b.dataset.lay; LS.set('layout', layout); }
    pop.remove(); applyLayout();
  });
};
addEventListener('click', e => { const p = $('.layout-pop'); if (p && !p.contains(e.target)) p.remove(); });
/* thanh kéo đổi cỡ các khung */
function placeSplitters() {
  const ed = $('#editor'); ed.querySelectorAll('.splitter').forEach(x => x.remove());
  if (ed.classList.contains('hidden') || innerWidth <= 1100) return;
  const cs = getComputedStyle(ed), cols = cs.gridTemplateColumns.split(' ').map(parseFloat), rows = cs.gridTemplateRows.split(' ').map(parseFloat);
  const er = ed.getBoundingClientRect(), y1 = rows[0], y2 = rows[0] + rows[1];
  let x = 0;
  for (let i = 0; i < cols.length - 1; i++) {
    x += cols[i]; const sp = document.createElement('div'); sp.className = 'splitter v';
    Object.assign(sp.style, { left: x + 'px', top: y1 + 'px', height: (er.height - y1) + 'px' }); ed.appendChild(sp);
    sp.onpointerdown = e => {
      e.preventDefault(); sp.setPointerCapture(e.pointerId); sp.classList.add('drag'); const x0 = e.clientX, c0 = [...cols];
      sp.onpointermove = ev => {
        const d = clamp(ev.clientX - x0, -c0[i] + 240, c0[i + 1] - 240), c = [...c0]; c[i] += d; c[i + 1] -= d;
        c.forEach((w, j) => ed.style.setProperty('--c' + j, w.toFixed(0) + 'fr'));
      };
      sp.onpointerup = () => { sp.onpointermove = null; sp.classList.remove('drag'); for (let j = 0; j < cols.length; j++) saveSize('--c' + j, ed.style.getPropertyValue('--c' + j)); placeSplitters(); };
    };
  }
  // ranh giới trên timeline
  const tt = $('#editor .tl-tools').getBoundingClientRect(), sp = document.createElement('div'); sp.className = 'splitter h';
  Object.assign(sp.style, { left: (tt.left - er.left) + 'px', width: tt.width + 'px', top: (tt.top - er.top) + 'px' }); ed.appendChild(sp);
  sp.onpointerdown = e => {
    e.preventDefault(); sp.setPointerCapture(e.pointerId); sp.classList.add('drag'); const y0 = e.clientY, h0 = rows[3];
    sp.onpointermove = ev => ed.style.setProperty('--tlh', clamp(h0 - (ev.clientY - y0), 120, er.height - 260).toFixed(0) + 'px');
    sp.onpointerup = () => { sp.onpointermove = null; sp.classList.remove('drag'); saveSize('--tlh', ed.style.getPropertyValue('--tlh')); placeSplitters(); };
  };
}
addEventListener('resize', () => { clearTimeout(placeSplitters.t); placeSplitters.t = setTimeout(placeSplitters, 120); });
applyLayout();

/* ================= KHỞI ĐỘNG ================= */
(async () => {
  if (document.fonts) document.fonts.load('600 40px Montserrat').catch(() => {});
  openHome();
  if (token && SERVER) {
    try { me = await api('/api/me'); renderAcct(); } catch { me = null; renderAcct(); }
  }
})();
