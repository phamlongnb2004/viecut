#!/usr/bin/env node
// Cắt các file cài trong build/ thành phần 20 MB vào cloudflare/site/files/ + ghi manifest.json, để deploy lên Cloudflare.
// Dùng: node tools/pack-cloudflare.js [thư-mục-chứa-file-cài] [phiên-bản]
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const SRC = path.resolve(process.argv[2] || path.join(ROOT, 'build'));
const VER = process.argv[3] || require(path.join(ROOT, 'app', 'package.json')).version;
const SITE = path.join(ROOT, 'cloudflare', 'site'), FILES = path.join(SITE, 'files');
const PART = 20 * 1024 * 1024;
const MAP = {
  windows: ['VIECUT-Setup.exe', 'application/vnd.microsoft.portable-executable'],
  'windows-portable': ['VIECUT-Windows-portable.zip', 'application/zip'],
  android: ['VIECUT.apk', 'application/vnd.android.package-archive'],
  ios: ['VIECUT.ipa', 'application/octet-stream'],
  linux: ['VIECUT-Linux.tar.gz', 'application/gzip'],
};
fs.rmSync(FILES, { recursive: true, force: true });
fs.mkdirSync(FILES, { recursive: true });
const man = { version: VER, built: Date.now(), files: {} };
for (const [key, [name, type]] of Object.entries(MAP)) {
  const src = path.join(SRC, name);
  if (!fs.existsSync(src)) { console.log('  (bỏ qua, không có)', name); continue; }
  const size = fs.statSync(src).size, dir = path.join(FILES, key);
  fs.mkdirSync(dir, { recursive: true });
  const fd = fs.openSync(src, 'r'), buf = Buffer.alloc(PART);
  let i = 0;
  for (let off = 0; off < size; off += PART, i++) {
    const n = fs.readSync(fd, buf, 0, PART, off);
    fs.writeFileSync(path.join(dir, String(i).padStart(3, '0') + '.bin'), buf.subarray(0, n));
  }
  fs.closeSync(fd);
  man.files[key] = { name, type, size, partSize: PART, parts: i };
  console.log(`  ${name}: ${(size / 1048576).toFixed(1)} MB, ${i} phần`);
}
fs.writeFileSync(path.join(SITE, 'manifest.json'), JSON.stringify(man, null, 2));
fs.writeFileSync(path.join(SITE, '.assetsignore'), '');
console.log('Xong. Giờ chạy: npx wrangler deploy');
