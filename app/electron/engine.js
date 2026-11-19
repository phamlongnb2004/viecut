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

/**
 * Tạo tham số FFmpeg.
 * job = { W, H, outW, outH, fps, crf, preset, duration, out,
 *         items: [{ id, kind:'video'|'image'|'audio'|'text', start, dur, in, volume, scale, fit, x, y, mediaId }],
 *         media: { [mediaId]: { path, width, height, hasAudio } },
 *         textPng: { [itemId]: path } }   // chữ đã vẽ sẵn cỡ outW x outH, nền trong suốt
 */
function buildArgs(job) {
  const { W, H, outW, outH, fps, duration: D } = job;
  const k = outW / W; // hệ số từ tọa độ dự án sang khung xuất
  const args = ['-hide_banner', '-y'];
  const filters = [];
  let nIn = 0;
  const addInput = a => { args.push(...a); return nIn++; };

  filters.push(`color=c=black:s=${outW}x${outH}:r=${fps}:d=${num(D)}[base0]`);
  let base = 'base0', step = 0;
  const audio = [];

  // ---- hình: video, ảnh (theo thứ tự bắt đầu), rồi chữ nằm trên cùng ----
  const vis = job.items.filter(i => i.kind === 'video' || i.kind === 'image').sort((a, b) => a.start - b.start);
  const texts = job.items.filter(i => i.kind === 'text' && job.textPng[i.id]).sort((a, b) => a.start - b.start);
  for (const it of [...vis, ...texts]) {
    const start = it.start, end = it.start + it.dur;
    let idx, chain;
    if (it.kind === 'text') {
      idx = addInput(['-loop', '1', '-framerate', String(fps), '-t', num(it.dur), '-i', job.textPng[it.id]]);
      chain = `[${idx}:v]format=rgba,setpts=PTS-STARTPTS+${num(start)}/TB[v${idx}]`;
      filters.push(chain);
      filters.push(`[${base}][v${idx}]overlay=0:0:eof_action=pass:enable='between(t,${num(start)},${num(end)})'[b${++step}]`);
      base = `b${step}`; continue;
    }
    const m = job.media[it.mediaId]; if (!m || !m.path) continue;
    if (it.kind === 'video') idx = addInput(['-ss', num(it.in || 0), '-t', num(it.dur), '-i', m.path]);
    else idx = addInput(['-loop', '1', '-framerate', String(fps), '-t', num(it.dur), '-i', m.path]);
    const sw = m.width || W, sh = m.height || H;
    const s = (it.fit === 'cover' ? Math.max(W / sw, H / sh) : Math.min(W / sw, H / sh)) * (it.scale || 1);
    const w = even(sw * s * k), h = even(sh * s * k);
    const x = Math.round((outW - w) / 2 + (it.x || 0) * outW), y = Math.round((outH - h) / 2 + (it.y || 0) * outH);
    filters.push(`[${idx}:v]fps=${fps},scale=${w}:${h}:flags=lanczos,setsar=1,format=rgba,setpts=PTS-STARTPTS+${num(start)}/TB[v${idx}]`);
    filters.push(`[${base}][v${idx}]overlay=${x}:${y}:eof_action=pass:enable='between(t,${num(start)},${num(end)})'[b${++step}]`);
    base = `b${step}`;
    if (it.kind === 'video' && m.hasAudio && (it.volume ?? 1) > 0) audio.push({ idx, it });
  }
  // ---- âm thanh riêng ----
  for (const it of job.items.filter(i => i.kind === 'audio')) {
    const m = job.media[it.mediaId]; if (!m || !m.path || (it.volume ?? 1) <= 0) continue;
    const idx = addInput(['-ss', num(it.in || 0), '-t', num(it.dur), '-i', m.path]);
    audio.push({ idx, it });
  }
  filters.push(`[${base}]format=yuv420p[vout]`);
  if (audio.length) {
    audio.forEach(({ idx, it }, j) => {
      const ms = Math.round(it.start * 1000);
      filters.push(`[${idx}:a]aresample=48000,asetpts=PTS-STARTPTS,volume=${num(it.volume ?? 1)},adelay=${ms}|${ms}[a${j}]`);
    });
    const ins = audio.map((_, j) => `[a${j}]`).join('');
    filters.push(`${ins}amix=inputs=${audio.length}:duration=longest:normalize=0,apad,atrim=0:${num(D)}[aout]`);
  } else {
    filters.push(`anullsrc=r=48000:cl=stereo,atrim=0:${num(D)}[aout]`);
  }
  args.push('-filter_complex', filters.join(';'), '-map', '[vout]', '-map', '[aout]',
    '-c:v', 'libx264', '-preset', job.preset || 'veryfast', '-crf', String(job.crf || 20), '-pix_fmt', 'yuv420p', '-r', String(fps),
    '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2',
    '-t', num(D), '-movflags', '+faststart', '-progress', 'pipe:1', '-nostats', job.out);
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
