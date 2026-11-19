// VIECUT trên Cloudflare Workers: trang tải app (/tai-app) và link tải cố định /tai/<nền tảng>.
// Tác giả: Phạm Thành Long (thlong)
// Cloudflare chỉ nhận file tĩnh tối đa 25 MB, nên mỗi file cài được cắt thành nhiều phần 20 MB
// (tools/pack-cloudflare.js) và Worker ghép lại thành một luồng tải duy nhất cho người dùng.

const OS = {
  windows: { name: 'Windows', sub: 'Bộ cài (khuyên dùng)', icon: '🪟', note: 'Chạy file, bấm Cài đặt. Nếu Windows hiện SmartScreen: More info → Run anyway.' },
  'windows-portable': { name: 'Windows', sub: 'Không cần cài (.zip)', icon: '🗂️', note: 'Giải nén rồi mở VIECUT.exe.' },
  android: { name: 'Android', sub: 'File APK', icon: '🤖', note: 'Mở file, cho phép “Cài ứng dụng không rõ nguồn gốc”.' },
  ios: { name: 'iOS', sub: 'IPA thử nghiệm', icon: '🍎', note: 'Cài bằng Sideloadly / AltStore với Apple ID phụ, ký lại sau 7 ngày.' },
  linux: { name: 'Linux', sub: '.tar.gz', icon: '🐧', note: 'Giải nén, chạy ./install.sh để thêm vào menu.' },
};

async function manifest(env, req) {
  const r = await env.ASSETS.fetch(new URL('/manifest.json', req.url));
  return r.ok ? r.json() : { version: '', built: 0, files: {} };
}

// ghép các phần thành một luồng; hỗ trợ tải tiếp (Range) để mạng yếu không phải tải lại từ đầu
async function serveFile(env, req, key, f) {
  const total = f.size, PART = f.partSize;
  let start = 0, end = total - 1, status = 200;
  const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get('Range') || '');
  if (m) {
    if (m[1] === '') { start = Math.max(0, total - Number(m[2])); }
    else { start = Number(m[1]); if (m[2] !== '') end = Math.min(total - 1, Number(m[2])); }
    if (start > end || start >= total) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${total}` } });
    status = 206;
  }
  const headers = {
    'Content-Type': f.type || 'application/octet-stream',
    'Content-Disposition': `attachment; filename="${f.name}"`,
    'Content-Length': String(end - start + 1),
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-cache',
  };
  if (status === 206) headers['Content-Range'] = `bytes ${start}-${end}/${total}`;
  if (req.method === 'HEAD') return new Response(null, { status, headers });

  const { readable, writable } = new TransformStream();
  (async () => {
    const w = writable.getWriter();
    try {
      for (let i = Math.floor(start / PART); i * PART <= end; i++) {
        const pStart = i * PART, pEnd = Math.min(total, pStart + PART) - 1;
        const r = await env.ASSETS.fetch(new URL(`/files/${key}/${String(i).padStart(3, '0')}.bin`, req.url));
        if (!r.ok) throw new Error('thiếu phần ' + i);
        let buf = new Uint8Array(await r.arrayBuffer());
        const a = Math.max(start, pStart) - pStart, b = Math.min(end, pEnd) - pStart + 1;
        if (a > 0 || b < buf.length) buf = buf.subarray(a, b);
        await w.write(buf);
      }
      await w.close();
    } catch (e) { await w.abort(e); }
  })();
  return new Response(readable, { status, headers });
}

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const mb = n => (n / 1048576).toFixed(1) + ' MB';

function page(man) {
  const built = man.built ? new Date(man.built).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : '';
  const cards = Object.keys(OS).map(k => {
    const o = OS[k], f = man.files[k];
    if (!f) return `<div class="dl off"><span class="ic">${o.icon}</span><div><b>${o.name}</b> <i>${o.sub}</i><small>Sắp có</small></div></div>`;
    return `<a class="dl" href="/tai/${k}"><span class="ic">${o.icon}</span><div><b>${o.name}</b> <i>${o.sub}</i>
      <small>${esc(f.name)} · ${mb(f.size)}</small><small class="n">${esc(o.note)}</small></div><span class="go">Tải</span></a>`;
  }).join('');
  return `<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Tải VIECUT</title><meta name="description" content="VIECUT - app edit video cho Windows, Android, iOS, Linux">
<style>
*{box-sizing:border-box}body{margin:0;background:#0f1014;color:#e9eaee;font-family:Montserrat,system-ui,-apple-system,Segoe UI,sans-serif;display:flex;justify-content:center}
main{width:min(600px,92vw);padding:48px 0 40px}h1{font-size:48px;margin:0;letter-spacing:1px;font-weight:800}h1 b{color:#C1272C}
.lead{color:#b9bcc7;margin:8px 0 4px}.ver{color:#8b8e9a;font-size:13px;margin-bottom:22px}
.dl{display:flex;align-items:center;gap:14px;background:#17181d;border:1px solid #2c2e37;border-radius:14px;padding:16px;margin:10px 0;color:inherit;text-decoration:none}
a.dl:hover{border-color:#C1272C}.dl.off{opacity:.45}.ic{font-size:28px;width:40px;text-align:center}.dl div{flex:1;display:flex;flex-direction:column;gap:3px}
.dl i{font-style:normal;color:#8b8e9a;font-size:13px}.dl small{color:#8b8e9a;font-size:12px}.dl .n{color:#6f7280}
.go{background:#C1272C;color:#fff;font-weight:700;padding:9px 16px;border-radius:9px}
footer{color:#6f7280;font-size:12px;margin-top:28px;text-align:center}
</style></head><body><main><h1>VIE<b>CUT</b></h1>
<p class="lead">App edit video cho Windows, Android, iOS và Linux. Một tài khoản dùng trên mọi máy.</p>
<div class="ver">${man.version ? 'Phiên bản ' + esc(man.version) + (built ? ' · cập nhật ' + esc(built) : '') : ''}</div>
${cards}<footer>© VIECUT · Phạm Thành Long (thlong)</footer></main></body></html>`;
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url), p = url.pathname.replace(/\/+$/, '') || '/';
    if (p === '/' || p === '/tai-app' || p === '/tai') {
      return new Response(page(await manifest(env, req)), { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' } });
    }
    const m = /^\/tai\/([a-z-]+)$/.exec(p);
    if (m) {
      const man = await manifest(env, req), f = man.files[m[1]];
      if (!f) return new Response('Chưa có bản này. Xem trang /tai-app', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
      return serveFile(env, req, m[1], f);
    }
    if (p === '/api/latest') return Response.json(await manifest(env, req));
    if (p.startsWith('/files/') || p === '/manifest.json') return new Response('Not found', { status: 404 });
    return env.ASSETS.fetch(req);
  },
};
