/* Cầu nối native: lưu file video xuất ra trên Windows (Electron) và Android/iOS (Capacitor) */
(function () {
  // Windows (Electron): hộp thoại "Lưu thành…"
  if (window.electronAPI) {
    window.NativeBridge = {
      async saveVideo(blob, name) {
        const p = await window.electronAPI.saveFile(name, await blob.arrayBuffer());
        return p ? 'Đã lưu: ' + p : null;
      },
    };
    return;
  }
  const readB64 = blob => new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1] || '');
    r.onerror = () => rej(r.error); r.readAsDataURL(blob);
  });
  // Android (app gốc VIECUT.apk): lưu thẳng vào thư viện máy, thư mục Movies/VIECUT
  if (window.AndroidBridge) {
    window.NativeBridge = {
      async saveVideo(blob, name) {
        const B = window.AndroidBridge, CHUNK = 3 * 1024 * 1024;
        const err = B.saveBegin(name, blob.type || 'video/mp4');
        if (err) throw new Error(err);
        for (let off = 0; off < blob.size; off += CHUNK) {
          const e2 = B.saveChunk(await readB64(blob.slice(off, off + CHUNK)));
          if (e2) throw new Error(e2);
        }
        return B.saveEnd();
      },
    };
    return;
  }
  // iOS (Capacitor): ghi file rồi mở bảng Chia sẻ (Lưu video vào Ảnh, Drive, Zalo, TikTok…)
  const C = window.Capacitor;
  if (!(C && C.isNativePlatform && C.isNativePlatform())) return;
  window.NativeBridge = {
    async saveVideo(blob, name) {
      const { Filesystem, Share } = C.Plugins;
      const path = 'export/' + name, CHUNK = 3 * 1024 * 1024; // bội số của 3 để base64 nối được
      for (let off = 0; off < blob.size; off += CHUNK) {
        const data = await readB64(blob.slice(off, off + CHUNK));
        if (off === 0) await Filesystem.writeFile({ path, data, directory: 'CACHE', recursive: true });
        else await Filesystem.appendFile({ path, data, directory: 'CACHE' });
      }
      const { uri } = await Filesystem.getUri({ path, directory: 'CACHE' });
      await Share.share({ title: name, url: uri, dialogTitle: 'Lưu / chia sẻ video' });
      return null;
    },
  };
})();
