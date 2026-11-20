/* VIECUT – màu sắc, bộ lọc, hiệu ứng động của clip, chuyển cảnh, hiệu ứng video, nhãn dán, âm thanh tự tạo
   Tác giả: Phạm Thành Long (thlong) */
'use strict';

/* ---------- Điều chỉnh màu (giá trị -100..100, giống thanh trượt CapCut) ---------- */
const ADJ = [
  ['Màu', [['temp', 'Nhiệt độ màu'], ['tint', 'Tông màu'], ['sat', 'Độ bão hòa']]],
  ['Độ sáng', [['exposure', 'Phơi sáng'], ['contrast', 'Tương phản'], ['highlight', 'Vùng sáng'], ['shadow', 'Bóng'], ['bright', 'Độ chói']]],
  ['Hiệu ứng', [['sharpen', 'Làm sắc nét', 0], ['grain', 'Hạt nhỏ', 0], ['blur', 'Làm mờ', 0], ['vignette', 'Viền mờ dần', 0]]],
];
const ADJ_KEYS = ADJ.flatMap(g => g[1].map(k => k[0]));
const ADJ_MIN0 = new Set(['sharpen', 'grain', 'blur', 'vignette']);

/* ---------- Bộ lọc màu có sẵn (tổ hợp các thông số điều chỉnh) ---------- */
const FILTERS = [
  ['warm', 'Ấm áp', { temp: 35, sat: 10, exposure: 5 }],
  ['cool', 'Mát lạnh', { temp: -35, sat: 5, tint: -5 }],
  ['vivid', 'Rực rỡ', { sat: 40, contrast: 15 }],
  ['bw', 'Đen trắng', { sat: -100, contrast: 15 }],
  ['retro', 'Hoài niệm', { temp: 20, sat: -25, contrast: -10, grain: 25, vignette: 30 }],
  ['film', 'Phim cũ', { sat: -40, temp: 25, grain: 45, vignette: 45, contrast: -5 }],
  ['cine', 'Điện ảnh', { contrast: 20, sat: -10, temp: -10, vignette: 35, shadow: -10 }],
  ['dream', 'Mộng mơ', { exposure: 10, contrast: -20, sat: -10, tint: 10, bright: 10 }],
  ['sunset', 'Hoàng hôn', { temp: 50, tint: 15, sat: 20 }],
  ['fresh', 'Trong trẻo', { exposure: 8, sat: 15, temp: -10, highlight: -10 }],
  ['moody', 'Trầm buồn', { exposure: -10, sat: -30, contrast: 10, vignette: 40, temp: -15 }],
  ['punch', 'Tương phản cao', { contrast: 45, sat: 10 }],
  ['fade', 'Nhạt màu', { sat: -45, exposure: 8, contrast: -15 }],
  ['green', 'Xanh rừng', { tint: -25, temp: -10, sat: 15 }],
  ['pink', 'Hồng phấn', { tint: 25, temp: 10, exposure: 5, contrast: -10 }],
];
const filterById = id => FILTERS.find(f => f[0] === id);

/** Thông số màu thực tế của clip = điều chỉnh + bộ lọc × cường độ */
function effAdj(it) {
  const a = Object.assign({}, it.adj || {});
  const f = it.filter && filterById(it.filter.id);
  if (f) { const k = (it.filter.amount ?? 100) / 100; for (const [key, v] of Object.entries(f[2])) a[key] = (a[key] || 0) + v * k; }
  for (const key of ADJ_KEYS) { a[key] = Math.max(ADJ_MIN0.has(key) ? 0 : -100, Math.min(100, a[key] || 0)); }
  return a;
}
const adjActive = a => ADJ_KEYS.some(k => Math.abs(a[k] || 0) > 0.5);

/** Bộ lọc CSS cho xem trước nhanh trên canvas */
function cssFilter(a) {
  const f = [];
  const br = 1 + (a.exposure || 0) / 100 * 0.45 + (a.bright || 0) / 100 * 0.25 + (a.shadow || 0) / 100 * 0.1;
  if (Math.abs(br - 1) > 0.005) f.push(`brightness(${br.toFixed(3)})`);
  const ct = 1 + (a.contrast || 0) / 100 * 0.8 - (a.highlight || 0) / 100 * 0.1;
  if (Math.abs(ct - 1) > 0.005) f.push(`contrast(${ct.toFixed(3)})`);
  const st = 1 + (a.sat || 0) / 100;
  if (Math.abs(st - 1) > 0.005) f.push(`saturate(${Math.max(0, st).toFixed(3)})`);
  if (a.blur > 0) f.push(`blur(${(a.blur / 100 * 14).toFixed(1)}px)`);
  return f.join(' ') || 'none';
}
/** Lớp phủ nhiệt độ / tông màu / viền tối / hạt (vẽ đè lên vùng clip) */
let grainTile = null;
function drawAdjOverlay(g, b, a, mul = 1) {
  if (!b) return;
  g.save(); g.translate(b.cx, b.cy); g.rotate((b.rot || 0) * Math.PI / 180);
  g.beginPath(); g.rect(-b.w / 2, -b.h / 2, b.w, b.h); g.clip();
  const tint = (col, amt) => { g.globalCompositeOperation = 'soft-light'; g.globalAlpha = Math.min(1, Math.abs(amt) / 100 * 0.9) * mul; g.fillStyle = col; g.fillRect(-b.w / 2, -b.h / 2, b.w, b.h); };
  if (a.temp) tint(a.temp > 0 ? '#ff9a2e' : '#2e7dff', a.temp);
  if (a.tint) tint(a.tint > 0 ? '#ff3ec8' : '#2eff6a', a.tint);
  g.globalCompositeOperation = 'source-over';
  if (a.vignette > 0) {
    const r = Math.hypot(b.w, b.h) / 2, gr = g.createRadialGradient(0, 0, r * 0.35, 0, 0, r);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, `rgba(0,0,0,${(a.vignette / 100 * 0.85).toFixed(2)})`);
    g.globalAlpha = mul; g.fillStyle = gr; g.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
  }
  if (a.grain > 0) {
    if (!grainTile) { grainTile = document.createElement('canvas'); grainTile.width = grainTile.height = 128; }
    const gc = grainTile.getContext('2d'), im = gc.createImageData(128, 128);
    for (let i = 0; i < im.data.length; i += 4) { const v = Math.random() * 255; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255; }
    gc.putImageData(im, 0, 0);
    g.globalCompositeOperation = 'overlay'; g.globalAlpha = a.grain / 100 * 0.35 * mul;
    g.fillStyle = g.createPattern(grainTile, 'repeat'); g.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
  }
  g.restore();
}

/* ---------- Hiệu ứng động & chuyển cảnh của clip video/ảnh ---------- */
const CLIP_ANIMS = [['none', 'Không có'], ['fade', 'Mờ dần'], ['slideL', 'Trượt từ phải'], ['slideR', 'Trượt từ trái'], ['slideU', 'Trượt từ dưới'], ['slideD', 'Trượt từ trên'], ['zoomIn', 'Phóng to'], ['zoomOut', 'Thu nhỏ']];
const TRANSITIONS = [
  ['fade', 'Hòa tan', '🌫️'], ['black', 'Mờ đen', '⬛'], ['white', 'Lóe trắng', '⬜'],
  ['slideL', 'Trượt trái', '⬅️'], ['slideR', 'Trượt phải', '➡️'], ['slideU', 'Trượt lên', '⬆️'], ['slideD', 'Trượt xuống', '⬇️'], ['zoom', 'Phóng to', '🔍'],
];
const UNDERLAY = new Set(['fade', 'slideL', 'slideR', 'slideU', 'slideD', 'zoom']); // cần clip trước kéo dài bên dưới
const ease3 = p => 1 - Math.pow(1 - Math.max(0, Math.min(1, p)), 3);
function applyClipAnim(st, type, p) { // p: 0 -> 1 (hiện ra)
  p = Math.max(0, Math.min(1, p)); const e = ease3(p);
  if (type === 'fade') st.a *= p;
  else if (type === 'slideL') st.dx += (1 - e);
  else if (type === 'slideR') st.dx -= (1 - e);
  else if (type === 'slideU') st.dy += (1 - e);
  else if (type === 'slideD') st.dy -= (1 - e);
  else if (type === 'zoomIn' || type === 'zoom') { st.sc *= 0.4 + 0.6 * e; st.a *= p; }
  else if (type === 'zoomOut') { st.sc *= 1 + (1 - e) * 0.6; st.a *= p; }
}
/** Hiệu ứng vào/ra thực tế của clip (đã tính chuyển cảnh). next = clip liền sau trên track video. */
function clipAnimSpec(it, next) {
  const A = it.anim || {}, half = it.dur / 2; let inn = null, out = null;
  const tr = it.trans && it.trans.type && it.trans.type !== 'none' ? it.trans : null;
  if (tr) { const d = Math.min(tr.dur || 0.6, it.dur); if (tr.type === 'black') inn = { type: 'fade', d: d / 2 }; else if (tr.type !== 'white') inn = { type: tr.type, d }; }
  else if (A.in && A.in.type && A.in.type !== 'none') inn = { type: A.in.type, d: Math.min(A.in.dur || 0.5, half) };
  const nt = next && next.trans && next.trans.type;
  if (nt === 'black') out = { type: 'fade', d: Math.min((next.trans.dur || 0.6) / 2, half) };
  else if (nt && UNDERLAY.has(nt)) out = null; // clip sau phủ lên, clip này kéo dài bên dưới
  else if (A.out && A.out.type && A.out.type !== 'none') out = { type: A.out.type, d: Math.min(A.out.dur || 0.5, half) };
  const ext = nt && UNDERLAY.has(nt) ? Math.min(next.trans.dur || 0.6, next.dur) : 0;
  return { inn, out, ext };
}
function clipState(it, tl, spec) {
  const st = { a: 1, dx: 0, dy: 0, sc: 1 };
  if (spec.inn && tl < spec.inn.d) applyClipAnim(st, spec.inn.type, tl / spec.inn.d);
  if (spec.out && tl > it.dur - spec.out.d) applyClipAnim(st, spec.out.type, (it.dur - tl) / spec.out.d);
  return st;
}

/* ---------- Hiệu ứng video (đặt trên track Hiệu ứng, áp lên mọi thứ bên dưới) ---------- */
const VFX = [
  ['bw', 'Đen trắng', '🖤'], ['sepia', 'Cổ điển', '🟫'], ['blur', 'Làm mờ', '💧'], ['grain', 'Hạt phim', '🎞️'],
  ['vignette', 'Viền tối', '⚫'], ['flash', 'Lóe sáng nhịp', '⚡'], ['vhs', 'Băng VHS', '📼'], ['invert', 'Âm bản', '🌓'],
  ['bright', 'Rực sáng', '☀️'], ['dark', 'Ban đêm', '🌙'],
];
const vfxName = t => (VFX.find(v => v[0] === t) || [, 'Hiệu ứng'])[1];
let fxTmp = null;
function drawVfx(g, type, tl, W, H, k = 1) {
  const css = { bw: 'grayscale(1)', sepia: 'sepia(0.85) contrast(1.05)', blur: 'blur(10px)', invert: 'invert(1)', bright: 'brightness(1.35) saturate(1.2)', dark: 'brightness(0.6) saturate(0.7)' }[type];
  if (css || type === 'vhs') {
    if (!fxTmp) fxTmp = document.createElement('canvas');
    fxTmp.width = g.canvas.width; fxTmp.height = g.canvas.height;
    const t = fxTmp.getContext('2d'); t.drawImage(g.canvas, 0, 0);
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
    if (type === 'vhs') {
      g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.35;
      g.drawImage(fxTmp, 6 * k, 0); g.drawImage(fxTmp, -6 * k, 0);
    } else { g.filter = css.replace('10px', (10 * k).toFixed(1) + 'px'); g.drawImage(fxTmp, 0, 0); }
    g.restore();
  }
  if (type === 'grain' || type === 'vhs') drawAdjOverlay(g, { cx: W / 2, cy: H / 2, w: W, h: H }, { grain: type === 'vhs' ? 45 : 60 });
  if (type === 'vignette') drawAdjOverlay(g, { cx: W / 2, cy: H / 2, w: W, h: H }, { vignette: 80 });
  if (type === 'flash') { const p = Math.max(0, 1 - ((tl % 0.6) / 0.6) * 3); if (p > 0) { g.save(); g.fillStyle = `rgba(255,255,255,${(p * 0.55).toFixed(3)})`; g.fillRect(0, 0, W, H); g.restore(); } }
}

/* ---------- Nhãn dán: emoji + hình vẽ ---------- */
const STICKERS = {
  'Cảm xúc': ['😀', '😂', '🥰', '😍', '😎', '🤩', '😭', '😡', '🤔', '😱', '🥳', '😴', '🙏', '👍', '👏', '💪'],
  'Biểu tượng': ['❤️', '🔥', '⭐', '✨', '💯', '✅', '❌', '⚠️', '❓', '❗', '💡', '🎉', '🎁', '🏆', '📌', '📍'],
  'Mũi tên & chỉ': ['👉', '👈', '👆', '👇', '➡️', '⬅️', '⬆️', '⬇️', '↗️', '🔄', '🔝', '🆕'],
  'Học tập': ['📚', '✏️', '📝', '🎓', '🏫', '🧠', '💬', '🗣️', '🇻🇳', '🇬🇧', '🇺🇸', '🌏'],
};
const SHAPES = [['arrow', 'Mũi tên'], ['circle', 'Khoanh tròn'], ['rect', 'Khung'], ['underline', 'Gạch chân'], ['star', 'Ngôi sao'], ['heart', 'Trái tim'], ['bubble', 'Bóng thoại'], ['check', 'Dấu tích']];
function drawShape(g, shape, w, h, color, lw) {
  g.strokeStyle = g.fillStyle = color; g.lineWidth = lw; g.lineJoin = g.lineCap = 'round';
  const W2 = w / 2, H2 = h / 2;
  g.beginPath();
  if (shape === 'arrow') { g.moveTo(-W2, 0); g.lineTo(W2 - lw * 2, 0); g.stroke(); g.beginPath(); g.moveTo(W2, 0); g.lineTo(W2 - h * 0.45, -H2 * 0.8); g.lineTo(W2 - h * 0.45, H2 * 0.8); g.closePath(); g.fill(); }
  else if (shape === 'circle') { g.ellipse(0, 0, W2 - lw, H2 - lw, 0, 0, Math.PI * 2); g.stroke(); }
  else if (shape === 'rect') { g.rect(-W2 + lw, -H2 + lw, w - lw * 2, h - lw * 2); g.stroke(); }
  else if (shape === 'underline') { g.moveTo(-W2, 0); g.quadraticCurveTo(0, H2 * 0.6, W2, -H2 * 0.1); g.stroke(); }
  else if (shape === 'star') { for (let i = 0; i < 10; i++) { const r = i % 2 ? Math.min(W2, H2) * 0.45 : Math.min(W2, H2), a = -Math.PI / 2 + i * Math.PI / 5; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); g.fill(); }
  else if (shape === 'heart') { const s = Math.min(W2, H2); g.moveTo(0, s * 0.85); g.bezierCurveTo(-s * 1.4, -s * 0.1, -s * 0.6, -s * 1.1, 0, -s * 0.4); g.bezierCurveTo(s * 0.6, -s * 1.1, s * 1.4, -s * 0.1, 0, s * 0.85); g.fill(); }
  else if (shape === 'bubble') { const r = Math.min(W2, H2) * 0.35; g.roundRect ? g.roundRect(-W2 + lw, -H2 + lw, w - lw * 2, h * 0.75, r) : g.rect(-W2 + lw, -H2 + lw, w - lw * 2, h * 0.75); g.stroke(); g.beginPath(); g.moveTo(-W2 * 0.4, -H2 + h * 0.75 + lw); g.lineTo(-W2 * 0.55, H2 - lw); g.lineTo(-W2 * 0.05, -H2 + h * 0.75 + lw); g.stroke(); }
  else if (shape === 'check') { g.moveTo(-W2 * 0.8, 0); g.lineTo(-W2 * 0.2, H2 * 0.7); g.lineTo(W2 * 0.85, -H2 * 0.75); g.stroke(); }
}

/* ---------- Âm thanh tự tạo (không bản quyền) ---------- */
const SFX = [['pop', 'Bóp bụp'], ['whoosh', 'Vút qua'], ['ding', 'Ting'], ['click', 'Click'], ['rise', 'Vút lên'], ['thump', 'Dập trầm'], ['sparkle', 'Lấp lánh'], ['bubble', 'Bong bóng'], ['beep', 'Bíp'], ['shutter', 'Chụp ảnh'], ['correct', 'Đúng rồi'], ['wrong', 'Sai rồi']];
async function makeSfx(type) {
  const sr = 48000, len = { whoosh: 0.7, rise: 1.0, sparkle: 1.0, correct: 0.7, wrong: 0.6, ding: 1.2 }[type] || 0.45;
  const ac = new OfflineAudioContext(2, Math.ceil(sr * len), sr), now = 0, out = ac.createGain(); out.gain.value = 0.6; out.connect(ac.destination);
  const env = (node, a, d, peak = 1) => { const g = ac.createGain(); g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(peak, now + a); g.gain.exponentialRampToValueAtTime(0.0001, now + a + d); node.connect(g); g.connect(out); return g; };
  const osc = (type2, f0, f1, t1) => { const o = ac.createOscillator(); o.type = type2; o.frequency.setValueAtTime(f0, now); if (f1) o.frequency.exponentialRampToValueAtTime(f1, now + t1); o.start(now); o.stop(now + len); return o; };
  const noise = () => { const b = ac.createBuffer(1, sr * len, sr), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; const s = ac.createBufferSource(); s.buffer = b; s.start(now); return s; };
  if (type === 'pop') env(osc('sine', 600, 120, 0.12), 0.005, 0.15);
  else if (type === 'whoosh') { const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.2; f.frequency.setValueAtTime(300, now); f.frequency.exponentialRampToValueAtTime(3500, now + 0.35); f.frequency.exponentialRampToValueAtTime(600, now + 0.65); noise().connect(f); env(f, 0.25, 0.4, 0.9); }
  else if (type === 'ding') { env(osc('sine', 1320), 0.005, 1.1, 0.7); env(osc('sine', 2640), 0.005, 0.6, 0.25); }
  else if (type === 'click') { const f = ac.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 2000; noise().connect(f); env(f, 0.001, 0.03); }
  else if (type === 'rise') env(osc('sawtooth', 200, 1600, 0.9), 0.3, 0.6, 0.35);
  else if (type === 'thump') env(osc('sine', 110, 40, 0.3), 0.005, 0.35, 1);
  else if (type === 'sparkle') { [1760, 2349, 2794, 3520].forEach((f, i) => { const o = ac.createOscillator(); o.frequency.value = f; const g = ac.createGain(); g.gain.setValueAtTime(0.0001, now + i * 0.12); g.gain.exponentialRampToValueAtTime(0.4, now + i * 0.12 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.12 + 0.4); o.connect(g); g.connect(out); o.start(now + i * 0.12); o.stop(now + len); }); }
  else if (type === 'bubble') env(osc('sine', 300, 900, 0.18), 0.01, 0.2, 0.8);
  else if (type === 'beep') env(osc('square', 1000), 0.005, 0.3, 0.3);
  else if (type === 'shutter') { const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 3000; noise().connect(f); env(f, 0.002, 0.06); const g2 = ac.createGain(); g2.gain.setValueAtTime(0.0001, now + 0.12); g2.gain.exponentialRampToValueAtTime(0.8, now + 0.125); g2.gain.exponentialRampToValueAtTime(0.0001, now + 0.2); const n2 = noise(); n2.connect(g2); g2.connect(out); }
  else if (type === 'correct') { [[880, 0], [1318, 0.15]].forEach(([f, t0]) => { const o = ac.createOscillator(); o.type = 'triangle'; o.frequency.value = f; const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.6, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.45); o.connect(g); g.connect(out); o.start(t0); o.stop(len); }); }
  else if (type === 'wrong') env(osc('sawtooth', 220, 110, 0.5), 0.01, 0.5, 0.4);
  const buf = await ac.startRendering();
  return wavBlob(buf);
}
function wavBlob(buf) {
  const ch = buf.numberOfChannels, n = buf.length, sr = buf.sampleRate, b = new ArrayBuffer(44 + n * ch * 2), v = new DataView(b);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + n * ch * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, ch, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr * ch * 2, true); v.setUint16(32, ch * 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * ch * 2, true);
  let o = 44; const data = []; for (let c = 0; c < ch; c++) data.push(buf.getChannelData(c));
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) { const s = Math.max(-1, Math.min(1, data[c][i])); v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); o += 2; }
  return new Blob([b], { type: 'audio/wav' });
}

/* ---------- Phụ đề SRT ---------- */
function parseSrt(txt) {
  const tm = s => { const m = /(\d+):(\d+):(\d+)[,.](\d+)/.exec(s); return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4] / 1000 : 0; };
  return txt.replace(/\r/g, '').split(/\n\s*\n/).map(b => {
    const L = b.trim().split('\n'); const i = L.findIndex(l => l.includes('-->')); if (i < 0) return null;
    const [a, z] = L[i].split('-->'); const text = L.slice(i + 1).join('\n').replace(/<[^>]+>/g, '').trim();
    return text ? { start: tm(a), end: tm(z), text } : null;
  }).filter(Boolean);
}

/* ---------- Khung hình chính (keyframe): giá trị thay đổi theo thời gian ---------- */
const KF_PROPS = { video: ['scale', 'x', 'y', 'rot', 'opacity', 'volume'], image: ['scale', 'x', 'y', 'rot', 'opacity'], audio: ['volume'], text: ['x', 'y', 'size', 'rot', 'opacity'] };
const KF_DEF = { scale: 1, x: 0, y: 0, rot: 0, opacity: 1, volume: 1, size: 64 };
const kfList = (it, k) => (it.kf && it.kf[k]) || [];
const hasKf = it => !!it.kf && Object.values(it.kf).some(l => l && l.length);
function kfVal(it, k, tl) {
  const L = kfList(it, k); if (!L.length) return it[k] ?? KF_DEF[k];
  if (tl <= L[0].t) return L[0].v;
  for (let i = 0; i < L.length - 1; i++) {
    const a = L[i], b = L[i + 1];
    if (tl < b.t) return a.v + (b.v - a.v) * (tl - a.t) / Math.max(1e-6, b.t - a.t);
  }
  return L[L.length - 1].v;
}
function kfApply(it, tl) {
  if (!hasKf(it)) return it;
  const o = Object.assign({}, it); for (const k of Object.keys(it.kf)) if (it.kf[k] && it.kf[k].length) o[k] = kfVal(it, k, tl);
  return o;
}
function kfSet(it, k, tl, v) {
  it.kf = it.kf || {}; const L = it.kf[k] = it.kf[k] || [];
  tl = Math.round(Math.max(0, Math.min(it.dur, tl)) * 1000) / 1000;
  const e = L.find(x => Math.abs(x.t - tl) < 0.02); if (e) e.v = v; else { L.push({ t: tl, v }); L.sort((a, b) => a.t - b.t); }
}
function kfDel(it, k, tl) {
  if (!it.kf || !it.kf[k]) return; it.kf[k] = it.kf[k].filter(x => Math.abs(x.t - tl) >= 0.02);
  if (!it.kf[k].length) delete it.kf[k]; if (!Object.keys(it.kf).length) delete it.kf;
}
/** Cắt keyframe tại a (giây tính từ đầu clip): [trái, phải (dời về 0)] */
function kfSplit(it, a) {
  if (!hasKf(it)) return [undefined, undefined];
  const L = {}, Rr = {};
  for (const [k, l] of Object.entries(it.kf)) {
    if (!l || !l.length) continue; const v = kfVal(it, k, a);
    L[k] = [...l.filter(x => x.t < a - 0.02), { t: a, v }];
    Rr[k] = [{ t: 0, v }, ...l.filter(x => x.t > a + 0.02).map(x => ({ t: +(x.t - a).toFixed(3), v: x.v }))];
  }
  return [L, Rr];
}
function kfShift(kf, d) { // dời toàn bộ keyframe (cắt đầu clip)
  if (!kf) return kf; const o = {};
  for (const [k, l] of Object.entries(kf)) { const n = l.map(x => ({ t: +(x.t - d).toFixed(3), v: x.v })).filter(x => x.t >= -0.001); if (n.length) o[k] = n; }
  return Object.keys(o).length ? o : undefined;
}
