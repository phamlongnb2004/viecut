/* VIECUT – nơi lưu dự án và media
   Tác giả: Phạm Thành Long (thlong)
   - LocalStore: lưu ngay trên máy (IndexedDB), dùng được khi chưa đăng nhập, không cần mạng.
   - CloudStore: lưu lên server khi đã đăng nhập, mở lại được trên máy khác. */
'use strict';

const LocalStore = (() => {
  let dbp = null;
  const urls = new Map(); // mediaId -> blob URL
  function db() {
    if (!dbp) dbp = new Promise((res, rej) => {
      const r = indexedDB.open('viecut', 1);
      r.onupgradeneeded = () => {
        const d = r.result;
        if (!d.objectStoreNames.contains('projects')) d.createObjectStore('projects', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('media')) d.createObjectStore('media', { keyPath: 'id' });
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error || new Error('Không mở được bộ nhớ trên máy'));
    });
    return dbp;
  }
  async function tx(store, mode, fn) {
    const d = await db();
    return new Promise((res, rej) => {
      const t = d.transaction(store, mode), s = t.objectStore(store);
      let out; const r = fn(s);
      if (r) r.onsuccess = () => { out = r.result; };
      t.oncomplete = () => res(out);
      t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error('Hết dung lượng lưu trữ?'));
    });
  }
  const uid = () => 'l' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const metaOf = m => { const { blob, ...rest } = m; return rest; };
  return {
    kind: 'local', label: 'Trên máy này',
    async listProjects() {
      const all = await tx('projects', 'readonly', s => s.getAll()) || [];
      return all.map(p => ({ id: p.id, name: p.name, updated: p.updated, aspect: p.data && p.data.aspect, thumb: p.thumb || '', dur: p.dur || 0 }))
        .sort((a, b) => b.updated - a.updated);
    },
    getProject: id => tx('projects', 'readonly', s => s.get(id)),
    async createProject({ name, aspect }) {
      const p = { id: uid(), name: name || 'Dự án mới', data: { aspect: aspect || '9:16', items: [] }, updated: Date.now() };
      await tx('projects', 'readwrite', s => s.put(p)); return p;
    },
    async saveProject(id, { name, data, thumb, dur }) {
      const p = await this.getProject(id); if (!p) throw new Error('Không thấy dự án');
      if (name !== undefined) p.name = name; if (data !== undefined) p.data = data;
      if (thumb !== undefined) p.thumb = thumb; if (dur !== undefined) p.dur = dur;
      p.updated = Date.now(); await tx('projects', 'readwrite', s => s.put(p));
    },
    deleteProject: id => tx('projects', 'readwrite', s => s.delete(id)),
    async listMedia() {
      const all = await tx('media', 'readonly', s => s.getAll()) || [];
      for (const m of all) if (m.blob && !urls.has(m.id)) urls.set(m.id, URL.createObjectURL(m.blob));
      return all.map(metaOf).sort((a, b) => a.created - b.created);
    },
    async addMedia(file, meta, onProg) {
      const m = { id: uid(), name: file.name, kind: meta.kind || 'video', duration: +meta.duration || 0, width: +meta.width || 0,
        height: +meta.height || 0, thumb: meta.thumb || '', path: meta.path || '', size: file.size, created: Date.now(), blob: file };
      onProg && onProg(0.5);
      await tx('media', 'readwrite', s => s.put(m));
      urls.set(m.id, URL.createObjectURL(file)); onProg && onProg(1);
      return metaOf(m);
    },
    async deleteMedia(id) {
      await tx('media', 'readwrite', s => s.delete(id));
      if (urls.has(id)) { URL.revokeObjectURL(urls.get(id)); urls.delete(id); }
    },
    mediaUrl: m => urls.get(m.id) || '',
  };
})();

function makeCloudStore(ctx) { // ctx: { api, server(), token() }
  return {
    kind: 'cloud', label: 'Đám mây',
    listProjects: () => ctx.api('/api/projects'),
    getProject: id => ctx.api('/api/projects/' + id),
    createProject: b => ctx.api('/api/projects', { method: 'POST', json: b }),
    saveProject: (id, b) => ctx.api('/api/projects/' + id, { method: 'PUT', json: b }),
    deleteProject: id => ctx.api('/api/projects/' + id, { method: 'DELETE' }),
    listMedia: () => ctx.api('/api/media'),
    addMedia(file, meta, onProg) {
      return new Promise((res, rej) => {
        const fd = new FormData();
        for (const [k, v] of Object.entries(meta)) if (v !== undefined) fd.append(k, v);
        fd.append('file', file);
        const x = new XMLHttpRequest(); x.open('POST', ctx.server() + '/api/media');
        x.setRequestHeader('Authorization', 'Bearer ' + ctx.token());
        x.upload.onprogress = e => e.lengthComputable && onProg && onProg(e.loaded / e.total);
        x.onload = () => x.status < 300 ? res(JSON.parse(x.responseText)) : rej(new Error('Tải lên lỗi ' + x.status));
        x.onerror = () => rej(new Error('Tải lên lỗi mạng')); x.send(fd);
      });
    },
    deleteMedia: id => ctx.api('/api/media/' + id, { method: 'DELETE' }),
    mediaUrl: m => `${ctx.server()}/api/media/${m.id}/file?t=${encodeURIComponent(ctx.token())}`,
  };
}
