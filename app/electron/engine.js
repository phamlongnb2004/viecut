// VIECUT – lõi dựng video native bằng FFmpeg (C/C++)
// Tác giả: Phạm Thành Long (thlong)
// Nhận dự án (danh sách clip, chữ đã vẽ thành ảnh PNG, âm thanh) -> tạo lệnh FFmpeg -> xuất MP4 H.264 + AAC.
'use strict';
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const even = n => Math.max(2, Math.round(n / 2) * 2);
const num = n => (Math.round(n * 1000) / 1000).toString();

/** Đường dẫn ffmpeg đi kèm app (resources/ffmpeg), hoặc ffmpeg trên máy khi đang phát triển. */
function ffmpegPath(resourcesPath) {
  const exe = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  const cands = [
    process.env.VIECUT_FFMPEG,
    resourcesPath && path.join(resourcesPath, 'ffmpeg', exe),
    path.join(__dirname, '..', 'vendor', 'ffmpeg', process.platform === 'win32' ? 'win' : 'linux', exe),
  ].filter(Boolean);
  for (const c of cands) { try { if (fs.existsSync(c)) return c; } catch {} }
  return 'ffmpeg';
}

/** File có luồng âm thanh không (đọc thông tin từ ffmpeg -i). */
function probeAudio(ff, file) {
  return new Promise(res => {
    const p = spawn(ff, ['-hide_banner', '-i', file], { windowsHide: true });
    let err = '';
    p.stderr.on('data', d => { err += d; });
    p.on('close', () => res(/Stream #\d+:\d+.*Audio:/.test(err)));
    p.on('error', () => res(false));
  });
}

/* ---- màu sắc của clip: cùng công thức với bản xem trước (fx.js) ---- */
function colorFilters(a, k) {
  if (!a) return [];
  const f = [];
  const br = 1 + (a.exposure || 0) / 100 * 0.45 + (a.bright || 0) / 100 * 0.25 + (a.shadow || 0) / 100 * 0.1;
  if (Math.abs(br - 1) > 0.005) f.push(`colorchannelmixer=rr=${num(br)}:gg=${num(br)}:bb=${num(br)}`);
  const ct = 1 + (a.contrast || 0) / 100 * 0.8 - (a.highlight || 0) / 100 * 0.1, st = Math.max(0, 1 + (a.sat || 0) / 100);
  if (Math.abs(ct - 1) > 0.005 || Math.abs(st - 1) > 0.005) f.push(`eq=contrast=${num(ct)}:saturation=${num(st)}`);
  const tp = (a.temp || 0) / 100, tn = (a.tint || 0) / 100;
  if (tp || tn) {
    const c = v => num(Math.max(-1, Math.min(1, v)));
    f.push(`colorbalance=rm=${c(tp * 0.3 + tn * 0.12)}:gm=${c(-tn * 0.3 + tp * 0.04)}:bm=${c(-tp * 0.3 + tn * 0.12)}:rs=${c(tp * 0.15)}:bs=${c(-tp * 0.15)}`);
  }
  if (a.sharpen > 0) f.push(`unsharp=5:5:${num(a.sharpen / 100 * 1.6)}`);
  if (a.blur > 0) f.push(`gblur=sigma=${num(a.blur / 100 * 14 * k)}`);
  if (a.grain > 0) f.push(`noise=alls=${Math.round(a.grain * 0.3)}:allf=t`);
  if (a.vignette > 0) f.push(`vignette=angle=${num((0.08 + a.vignette / 100 * 0.35) * Math.PI / 2)}`);
  return f;
}
/* ---- hiệu ứng video trên track Hiệu ứng (áp lên toàn khung trong khoảng thời gian) ---- */
function vfxFilters(type, a, b, k) {
  const en = `enable='between(t,${num(a)},${num(b)})'`;
  const sep = 0.85, m = (i, s2) => num((1 - sep) * i + sep * s2);
  switch (type) {
    case 'bw': return [`hue=s=0:${en}`];
    case 'sepia': return [`colorchannelmixer=${m(1, .393)}:${m(0, .769)}:${m(0, .189)}:0:${m(0, .349)}:${m(1, .686)}:${m(0, .168)}:0:${m(0, .272)}:${m(0, .534)}:${m(1, .131)}:${en}`];
    case 'blur': return [`gblur=sigma=${num(10 * k)}:${en}`];
    case 'grain': return [`noise=alls=18:allf=t:${en}`];
    case 'vignette': return [`vignette=angle=${num(0.36 * Math.PI / 2)}:${en}`];
    case 'flash': return [`eq=brightness='0.5*max(0,1-3*mod(t-${num(a)},0.6)/0.6)':eval=frame:${en}`];
    case 'vhs': return [`rgbashift=rh=${Math.round(6 * k)}:bh=${-Math.round(6 * k)}:${en}`, `noise=alls=14:allf=t:${en}`];
    case 'invert': return [`negate:${en}`];
    case 'bright': return [`colorchannelmixer=rr=1.35:gg=1.35:bb=1.35:${en}`, `eq=saturation=1.2:${en}`];
    case 'dark': return [`colorchannelmixer=rr=0.6:gg=0.6:bb=0.6:${en}`, `eq=saturation=0.7:${en}`];
  }
  return [];
}
/** Biểu thức nội suy tuyến tính giữa các keyframe [{t,v}] theo biến thời gian T (chuỗi) */
function piece(L, T, f = v => v) {
  if (L.length === 1) return num(f(L[0].v));
  let e = num(f(L[L.length - 1].v));
  for (let i = L.length - 2; i >= 0; i--) {
    const a = L[i], b = L[i + 1], dt = Math.max(1e-6, b.t - a.t);
    e = `if(lt(${T},${num(b.t)}),${num(f(a.v))}+(${num(f(b.v) - f(a.v))})*(${T}-${num(a.t)})/${num(dt)},${e})`;
  }
  return `if(lt(${T},${num(L[0].t)}),${num(f(L[0].v))},${e})`;
}
/** Chuỗi atempo cho tốc độ bất kỳ (mỗi khâu 0.5..2) */
function atempo(s) {
  const f = []; while (s > 2) { f.push('atempo=2'); s /= 2; } while (s < 0.5) { f.push('atempo=0.5'); s /= 0.5; }
  if (Math.abs(s - 1) > 0.001) f.push(`atempo=${num(s)}`); return f;
}
/** Biểu thức dịch chuyển/thu phóng theo thời gian cho hiệu ứng vào/ra của clip */
function animExpr(ca, start, end) {
  const terms = { dx: [], dy: [], sc: [], fade: [] };
  const add = (sp, pExpr) => {
    const e1 = `pow(1-${pExpr},3)`; // 1 - ease
    if (sp.type === 'slideL') terms.dx.push(`+${e1}`); else if (sp.type === 'slideR') terms.dx.push(`-${e1}`);
    else if (sp.type === 'slideU') terms.dy.push(`+${e1}`); else if (sp.type === 'slideD') terms.dy.push(`-${e1}`);
    else if (sp.type === 'zoomIn' || sp.type === 'zoom') { terms.sc.push(`*(0.4+0.6*(1-${e1}))`); terms.fade.push(sp); }
    else if (sp.type === 'zoomOut') { terms.sc.push(`*(1+${e1}*0.6)`); terms.fade.push(sp); }
    else if (sp.type === 'fade') terms.fade.push(sp);
  };
  if (ca && ca.inn) add(ca.inn, `clip((t-${num(start)})/${num(ca.inn.d)},0,1)`);
  if (ca && ca.out) add(ca.out, `clip((${num(end)}-t)/${num(ca.out.d)},0,1)`);
  return terms;
}

/**
 * Tạo tham số FFmpeg.
 * job = { W, H, outW, outH, fps, crf, preset, codec:'h264'|'h265'|'mp3', duration, out,
 *         items: [{ id, kind, start, dur, in, speed, pitch, volume, fadeIn, fadeOut, scale, fit, x, y, rot, opacity, mediaId,
 *                   eadj (màu đã tính), ca: { inn, out, ext } (hiệu ứng vào/ra đã tính), flash (lóe trắng) }],
 *         fx: [{ type, start, dur }],
 *         media: { [mediaId]: { path, width, height, hasAudio } },
 *         textSegs: { [itemId]: [...] } }   // chữ/nhãn dán đã vẽ sẵn cỡ outW x outH, nền trong suốt
 */
function buildArgs(job) {
  const { W, H, outW, outH, fps, duration: D } = job;
  const audioOnly = job.codec === 'mp3';
  const k = outW / W; // hệ số từ tọa độ dự án sang khung xuất
  const args = ['-hide_banner', '-y'];
  const filters = [];
  let nIn = 0;
  const addInput = a => { args.push(...a); return nIn++; };
  let base = 'base0', step = 0;
  const audio = [];
  const spd = it => Math.max(0.05, it.speed || 1);

  if (!audioOnly) {
    filters.push(`color=c=black:s=${outW}x${outH}:r=${fps}:d=${num(D)}[base0]`);
    const vis = job.items.filter(i => i.kind === 'video' || i.kind === 'image').sort((a, b) => a.start - b.start);
    const textSegs = job.textSegs || {};
    for (const id of Object.keys(job.textPng || {})) if (!textSegs[id]) { const it = job.items.find(i => i.id === id); if (it) textSegs[id] = [{ start: it.start, dur: it.dur, png: job.textPng[id] }]; }
    const texts = job.items.filter(i => i.kind === 'text' && textSegs[i.id]).sort((a, b) => a.start - b.start);
    // ---- video, ảnh ----
    for (const it of vis) {
      const m = job.media[it.mediaId]; if (!m || !m.path) continue;
      const ca = it.ca || {}, ext = ca.ext || 0, start = it.start, end = it.start + it.dur, endV = end + ext, sp = spd(it);
      let idx;
      if (it.kind === 'video') idx = addInput(['-ss', num(it.in || 0), '-t', num((it.dur + ext) * sp), '-i', m.path]);
      else idx = addInput(['-loop', '1', '-framerate', String(fps), '-t', num(it.dur + ext), '-i', m.path]);
      const kf = it.kf || {}, hk = key => kf[key] && kf[key].length > 0, Tl = `(t-${num(start)})`;
      const sw = m.width || W, sh = m.height || H;
      const s = (it.fit === 'cover' ? Math.max(W / sw, H / sh) : Math.min(W / sw, H / sh)) * (hk('scale') ? 1 : (it.scale || 1));
      const w = even(sw * s * k), h = even(sh * s * k);
      const a = hk('rot') ? 1 : (it.rot || 0) * Math.PI / 180, ca2 = Math.abs(Math.cos(a)), sa = Math.abs(Math.sin(a));
      const diag = even(Math.hypot(w, h));
      const rw = hk('rot') ? diag : a ? even(w * ca2 + h * sa) : w, rh = hk('rot') ? diag : a ? even(w * sa + h * ca2) : h;
      const cxE = hk('x') ? `${num(outW / 2)}+(${piece(kf.x, Tl)})*${outW}` : num(outW / 2 + (it.x || 0) * outW);
      const cyE = hk('y') ? `${num(outH / 2)}+(${piece(kf.y, Tl)})*${outH}` : num(outH / 2 + (it.y || 0) * outH);
      const T = animExpr(ca, start, end);
      if (hk('scale')) T.sc.push(`*(${piece(kf.scale, Tl)})`);
      const ch = [`setpts=(PTS-STARTPTS)/${num(it.kind === 'video' ? sp : 1)}+${num(start)}/TB`, `fps=${fps}`, ...(ext && it.kind === 'video' ? [`tpad=stop_mode=clone:stop_duration=${num(ext + 0.1)}`] : []), `scale=${w}:${h}:flags=lanczos`, 'setsar=1',
        ...colorFilters(it.eadj, k), 'format=rgba'];
      if (hk('rot')) ch.push(`rotate=a='${piece(kf.rot, Tl, v => v * Math.PI / 180)}':ow=${rw}:oh=${rh}:c=black@0`);
      else if (a) ch.push(`rotate=${num(a)}:ow=${rw}:oh=${rh}:c=black@0`);
      if (hk('opacity')) ch.push(`geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='alpha(X,Y)*clip(${piece(kf.opacity, `(T-${num(start)})`)},0,1)'`);
      else if ((it.opacity ?? 1) < 1) ch.push(`colorchannelmixer=aa=${num(it.opacity)}`);
      if (T.sc.length) ch.push(`scale=w='max(2,trunc(${rw}${T.sc.join('')}/2)*2)':h='max(2,trunc(${rh}${T.sc.join('')}/2)*2)':eval=frame`);
      for (const f of T.fade) {
        if (f === ca.inn) ch.push(`fade=t=in:st=${num(start)}:d=${num(f.d)}:alpha=1`);
        else ch.push(`fade=t=out:st=${num(end - f.d)}:d=${num(f.d)}:alpha=1`);
      }
      filters.push(`[${idx}:v]${ch.join(',')}[v${idx}]`);
      const xE = `${cxE}-overlay_w/2${T.dx.length ? `+${outW}*(0${T.dx.join('')})` : ''}`, yE = `${cyE}-overlay_h/2${T.dy.length ? `+${outH}*(0${T.dy.join('')})` : ''}`;
      filters.push(`[${base}][v${idx}]overlay=x='${xE}':y='${yE}':eof_action=pass:enable='between(t,${num(start)},${num(endV)})'[b${++step}]`);
      base = `b${step}`;
      if (it.kind === 'video' && m.hasAudio && ((it.volume ?? 1) > 0 || (it.kf && it.kf.volume)) ) audio.push({ idx, it });
    }
    // ---- lóe trắng khi chuyển cảnh ----
    for (const it of vis) {
      if (!it.flash) continue;
      const d2 = it.flash / 2, t0 = Math.max(0, it.start - d2);
      const idx = addInput(['-f', 'lavfi', '-t', num(it.flash), '-i', `color=c=white:s=${outW}x${outH}:r=${fps}`]);
      filters.push(`[${idx}:v]format=rgba,setpts=PTS-STARTPTS+${num(t0)}/TB,fade=t=in:st=${num(t0)}:d=${num(it.start - t0)}:alpha=1,fade=t=out:st=${num(it.start)}:d=${num(d2)}:alpha=1[v${idx}]`);
      filters.push(`[${base}][v${idx}]overlay=0:0:eof_action=pass:enable='between(t,${num(t0)},${num(it.start + d2)})'[b${++step}]`);
      base = `b${step}`;
    }
    // ---- hiệu ứng video ----
    const fxs = (job.fx || []).filter(f => f.dur > 0);
    if (fxs.length) {
      const ch = fxs.flatMap(f => vfxFilters(f.type, f.start, f.start + f.dur, k));
      if (ch.length) { filters.push(`[${base}]${ch.join(',')}[b${++step}]`); base = `b${step}`; }
    }
    // ---- chữ, nhãn dán nằm trên cùng ----
    for (const it of texts) {
      for (const sg of textSegs[it.id]) {
        if (sg.dur <= 0) continue;
        const sf = sg.fps || fps; let idx;
        if (sg.png) idx = addInput(['-loop', '1', '-framerate', String(fps), '-t', num(sg.dur), '-i', sg.png]);
        else if (sg.loop) idx = addInput(['-stream_loop', '-1', '-framerate', String(sf), '-t', num(sg.dur), '-i', path.join(sg.seq, 'f%05d.png')]);
        else idx = addInput(['-framerate', String(sf), '-start_number', '0', '-i', path.join(sg.seq, 'f%05d.png')]);
        filters.push(`[${idx}:v]format=rgba,fps=${fps},setpts=PTS-STARTPTS+${num(sg.start)}/TB[v${idx}]`);
        filters.push(`[${base}][v${idx}]overlay=0:0:eof_action=pass:enable='between(t,${num(sg.start)},${num(sg.start + sg.dur - 0.0001)})'[b${++step}]`);
        base = `b${step}`;
      }
    }
    filters.push(`[${base}]format=yuv420p[vout]`);
  } else {
    for (const it of job.items.filter(i => i.kind === 'video')) {
      const m = job.media[it.mediaId]; if (!m || !m.path || !m.hasAudio || ((it.volume ?? 1) <= 0 && !(it.kf && it.kf.volume))) continue;
      audio.push({ idx: addInput(['-ss', num(it.in || 0), '-t', num(it.dur * spd(it)), '-i', m.path]), it });
    }
  }
  // ---- âm thanh riêng ----
  for (const it of job.items.filter(i => i.kind === 'audio')) {
    const m = job.media[it.mediaId]; if (!m || !m.path || ((it.volume ?? 1) <= 0 && !(it.kf && it.kf.volume))) continue;
    const idx = addInput(['-ss', num(it.in || 0), '-t', num(it.dur * spd(it)), '-i', m.path]);
    audio.push({ idx, it });
  }
  if (audio.length) {
    audio.forEach(({ idx, it }, j) => {
      const ms = Math.round(it.start * 1000), sp = spd(it), ch = ['aresample=48000', 'asetpts=PTS-STARTPTS'];
      if (Math.abs(sp - 1) > 0.001) { if (it.pitch) ch.push(`asetrate=${Math.round(48000 * sp)}`, 'aresample=48000'); else ch.push(...atempo(sp)); }
      const vk = it.kf && it.kf.volume && it.kf.volume.length ? it.kf.volume : null;
      ch.push(`atrim=0:${num(it.dur)}`, vk ? `volume='${piece(vk, 't')}':eval=frame` : `volume=${num(it.volume ?? 1)}`);
      if (it.fadeIn > 0) ch.push(`afade=t=in:st=0:d=${num(Math.min(it.fadeIn, it.dur))}`);
      if (it.fadeOut > 0) ch.push(`afade=t=out:st=${num(Math.max(0, it.dur - it.fadeOut))}:d=${num(Math.min(it.fadeOut, it.dur))}`);
      ch.push(`adelay=${ms}|${ms}`);
      filters.push(`[${idx}:a]${ch.join(',')}[a${j}]`);
    });
    const ins = audio.map((_, j) => `[a${j}]`).join('');
    filters.push(`${ins}amix=inputs=${audio.length}:duration=longest:normalize=0,apad,atrim=0:${num(D)}[aout]`);
  } else {
    filters.push(`anullsrc=r=48000:cl=stereo,atrim=0:${num(D)}[aout]`);
  }
  args.push('-filter_complex', filters.join(';'));
  if (audioOnly) args.push('-map', '[aout]', '-c:a', 'libmp3lame', '-b:a', '192k', '-ar', '48000', '-ac', '2');
  else {
    args.push('-map', '[vout]', '-map', '[aout]');
    if (job.codec === 'h265') args.push('-c:v', 'libx265', '-preset', job.preset || 'veryfast', '-crf', String((job.crf || 20) + 4), '-tag:v', 'hvc1', '-x265-params', 'log-level=error');
    else args.push('-c:v', 'libx264', '-preset', job.preset || 'veryfast', '-crf', String(job.crf || 20));
    args.push('-pix_fmt', 'yuv420p', '-r', String(fps), '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2', '-movflags', '+faststart');
  }
  args.push('-t', num(D), '-progress', 'pipe:1', '-nostats', job.out);
  return args;
}

/** Chạy xuất video. onProgress(0..1). Trả về { promise, cancel }. */
function run(ff, job, onProgress, log) {
  let proc = null, cancelled = false;
  const promise = (async () => {
    for (const id of Object.keys(job.media)) {
      const m = job.media[id];
      if (m.path && m.hasAudio === undefined) m.hasAudio = await probeAudio(ff, m.path);
    }
    const args = buildArgs(job);
    log && log('ffmpeg', JSON.stringify(args).slice(0, 4000));
    return new Promise((res, rej) => {
      proc = spawn(ff, args, { windowsHide: true });
      let tail = '';
      proc.stdout.on('data', d => {
        const m = /out_time_(?:us|ms)=(\d+)/.exec(String(d).split('\n').reverse().find(l => /out_time_(us|ms)=/.test(l)) || '');
        if (m) onProgress && onProgress(Math.min(1, Number(m[1]) / 1e6 / job.duration));
      });
      proc.stderr.on('data', d => { tail = (tail + d).slice(-4000); });
      proc.on('error', e => rej(new Error('Không chạy được FFmpeg: ' + e.message)));
      proc.on('close', code => {
        if (cancelled) return rej(Object.assign(new Error('Đã hủy'), { cancelled: true }));
        if (code === 0) { onProgress && onProgress(1); res(job.out); }
        else { log && log('ffmpeg lỗi', tail); rej(new Error('FFmpeg lỗi (mã ' + code + '): ' + tail.split('\n').filter(Boolean).slice(-2).join(' '))); }
      });
    });
  })();
  return { promise, cancel() { cancelled = true; try { proc && proc.kill('SIGKILL'); } catch {} } };
}

module.exports = { ffmpegPath, buildArgs, run, probeAudio };
