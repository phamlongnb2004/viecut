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
  const built = man.built ? new Date(man.built).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : '';
  const cards = Object.keys(OS).map(k => {
    const o = OS[k], f = man.files[k];
    const head = `<div class="ic">${o.icon}</div><div class="nm"><b>${o.name}</b><span>${o.sub}</span></div>`;
    if (!f) return `<div class="card off">${head}<div class="meta">Sắp có</div></div>`;
    return `<a class="card" href="/tai/${k}" data-os="${k}">${head}<div class="meta">${mb(f.size)}</div><p>${esc(o.note)}</p><span class="btn">Tải xuống</span></a>`;
  }).join('');
  return `<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Tải VIECUT – app edit video</title><meta name="description" content="VIECUT - app edit video cho Windows, Android, iOS, Linux">
<link rel="icon" href="/img/favicon.png"><script>try{if(localStorage.getItem("theme")==="dark")document.documentElement.dataset.theme="dark"}catch(e){}</script><meta property="og:image" content="/img/icon-256.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@500;600;700;800&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box}html,body{margin:0}
body{font-family:Montserrat,system-ui,sans-serif;color:#1d2420;background:#f4f7ef;min-height:100vh;
 background-image:radial-gradient(900px 520px at 10% -10%,rgba(193,39,44,.13),transparent 60%),radial-gradient(900px 600px at 100% 0%,rgba(63,154,60,.18),transparent 60%)}
.wrap{max-width:980px;margin:0 auto;padding:48px 22px 40px}
.hero{display:flex;align-items:center;gap:34px;flex-wrap:wrap}
.app-ic{width:150px;height:150px;border-radius:34px;box-shadow:0 18px 44px rgba(40,70,30,.25)}
.hero-t{flex:1;min-width:260px}.logo{width:min(420px,100%);display:block}
.tag{font-size:19px;font-weight:600;margin:14px 0 6px;color:#1d2420}.sub{color:#5f6a62;margin:0 0 20px;font-size:14px}
.main-btn{display:inline-flex;align-items:center;gap:10px;background:#C1272C;color:#fff;text-decoration:none;font-weight:800;padding:15px 26px;border-radius:14px;font-size:16px;box-shadow:0 10px 28px rgba(193,39,44,.45)}
.main-btn:hover{background:#d42f35}.main-btn small{font-weight:600;opacity:.85}
.ver{display:inline-block;margin-left:12px;color:#6d776f;font-size:13px}
h2{font-size:15px;text-transform:uppercase;letter-spacing:1.5px;color:#6d776f;margin:46px 0 14px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px}
.card{display:flex;flex-wrap:wrap;align-items:center;gap:12px;padding:18px;border-radius:18px;background:#fff;border:1px solid #e1e6da;color:inherit;text-decoration:none;transition:.15s;box-shadow:0 6px 20px rgba(40,60,30,.07)}
a.card:hover{border-color:#C1272C;transform:translateY(-3px);box-shadow:0 12px 28px rgba(40,60,30,.13)}
.card.off{opacity:.45}.ic{font-size:30px;width:44px;text-align:center}
.nm{flex:1;display:flex;flex-direction:column}.nm b{font-size:16px}.nm span{color:#6d776f;font-size:13px}
.meta{color:#3f9a3c;font-weight:700;font-size:13px}
.card p{flex-basis:100%;margin:0;color:#6d776f;font-size:12.5px;line-height:1.45}
.btn{flex-basis:100%;text-align:center;background:#fdecec;color:#C1272C;font-weight:700;padding:10px;border-radius:10px;font-size:14px}
a.card:hover .btn{background:#C1272C;color:#fff}
.feat{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:12px}
.f{padding:16px;border-radius:14px;background:#fff;border:1px solid #e1e6da;font-size:13.5px;color:#5f6a62}
.f b{display:block;color:#1d2420;margin-bottom:4px;font-size:14.5px}
footer{margin-top:44px;color:#8a938c;font-size:12.5px;text-align:center}
html[data-theme=dark] body{color:#e9eaee;background-color:#0d0f12;background-image:radial-gradient(900px 500px at 15% -10%,rgba(218,37,29,.28),transparent 60%),radial-gradient(800px 500px at 100% 10%,rgba(76,175,80,.2),transparent 60%)}
html[data-theme=dark] .tag,html[data-theme=dark] .nm b,html[data-theme=dark] .f b{color:#fff}
html[data-theme=dark] .sub,html[data-theme=dark] .f{color:#b4b8c2}
html[data-theme=dark] .card,html[data-theme=dark] .f{background:rgba(255,255,255,.05);border-color:rgba(255,255,255,.09);box-shadow:none}
html[data-theme=dark] .card p,html[data-theme=dark] .nm span,html[data-theme=dark] .ver,html[data-theme=dark] h2{color:#9aa0ab}
html[data-theme=dark] .meta{color:#FFCD00}
html[data-theme=dark] .btn{background:rgba(193,39,44,.18);color:#ff8a8d}
.theme{position:fixed;top:16px;right:16px;z-index:5;border:1px solid #e1e6da;background:#fff;border-radius:12px;padding:8px 12px;font-size:18px;cursor:pointer;box-shadow:0 4px 14px rgba(40,60,30,.1)}
html[data-theme=dark] .theme{background:#1f2027;border-color:#2c2e37}
</style></head><body><button class="theme" id="th" title="Đổi giao diện sáng / tối">🌙</button><div class="wrap">
<section class="hero"><img class="app-ic" src="/img/icon-256.png" alt="VIECUT">
<div class="hero-t"><img class="logo" src="/img/logo.png" alt="VIECUT">
<p class="tag">App edit video cho mọi máy, một tài khoản dùng khắp nơi.</p>
<p class="sub">Cắt ghép, thêm chữ, nhạc và xuất video 1080p ngay trên máy. Windows · Android · iOS · Linux.</p>
<a class="main-btn" id="mb" href="#tai">⬇ Tải VIECUT</a><span class="ver">${man.version ? 'Phiên bản ' + esc(man.version) + (built ? ' · ' + esc(built) : '') : ''}</span></div></section>
<h2 id="tai">Chọn bản cho máy của bạn</h2><div class="grid">${cards}</div>
<h2>Có gì trong VIECUT</h2><div class="feat">
<div class="f"><b>Timeline như CapCut</b>Kéo thả, cắt, tách clip, hoàn tác.</div>
<div class="f"><b>Chữ đẹp sẵn</b>Font Montserrat, màu nhanh, viền, nền, vùng an toàn TikTok.</div>
<div class="f"><b>Xuất 1080p</b>Dựng ngay trên máy, có âm thanh.</div>
<div class="f"><b>Đồng bộ dự án</b>Đăng nhập máy nào cũng mở lại được.</div></div>
<footer>© 2026 VIECUT · Phạm Thành Long (thlong)</footer></div>
<script>(function(){var d=document.documentElement,t=document.getElementById('th');function set(v){if(v==='dark')d.dataset.theme='dark';else delete d.dataset.theme;t.textContent=v==='dark'?'☀':'🌙';try{localStorage.setItem('theme',v)}catch(e){}}set(d.dataset.theme==='dark'?'dark':'light');t.onclick=function(){set(d.dataset.theme==='dark'?'light':'dark')};})();
(function(){var u=navigator.userAgent,k=/Android/i.test(u)?'android':/iPhone|iPad|iPod/i.test(u)?'ios':/Linux/i.test(u)?'linux':/Windows/i.test(u)?'windows':'';
var a=k&&document.querySelector('a.card[data-os="'+k+'"]'),b=document.getElementById('mb');
if(a){b.href=a.getAttribute('href');b.innerHTML='⬇ Tải cho '+a.querySelector('b').textContent+' <small>'+a.querySelector('.meta').textContent+'</small>';}})();</script>
</body></html>`;
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
    if (p.startsWith('/img/')) { const r = await env.ASSETS.fetch(req); const h = new Headers(r.headers); h.set('Cache-Control', 'public, max-age=86400'); return new Response(r.body, { status: r.status, headers: h }); }
    return env.ASSETS.fetch(req);
  },
};
