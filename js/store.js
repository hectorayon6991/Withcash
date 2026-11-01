/* WithCash — almacenamiento local en IndexedDB (con respaldo en localStorage si no está disponible).
   Guarda la caché de datos y la cola de sincronización sin el límite de ~5 MB de localStorage. */
(() => {
  "use strict";
  const DB_NAME = "withcash", STORE = "kv";
  let dbp = null;
  const open = () => dbp || (dbp = new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch { resolve(null); }
  }));
  const tx = async (mode, fn) => {
    const db = await open();
    if (!db) return undefined;
    return new Promise((resolve) => {
      try {
        const t = db.transaction(STORE, mode), s = t.objectStore(STORE);
        const req = fn(s);
        t.oncomplete = () => resolve(req?.result);
        t.onerror = t.onabort = () => resolve(undefined);
      } catch { resolve(undefined); }
    });
  };
  const lsGet = (k) => { try { const v = localStorage.getItem(k); return v == null ? undefined : JSON.parse(v); } catch { return undefined; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin espacio */ } };
  window.WCStore = {
    async get(k, d) {
      const db = await open();
      const v = db ? await tx("readonly", (s) => s.get(k)) : lsGet(k);
      return v === undefined ? d : v;
    },
    async set(k, v) {
      const db = await open();
      if (db) await tx("readwrite", (s) => s.put(v, k)); else lsSet(k, v);
    },
    async del(k) {
      const db = await open();
      if (db) await tx("readwrite", (s) => s.delete(k));
      try { localStorage.removeItem(k); } catch { /* */ }
    },
    // Migración única: lo que había en localStorage pasa a IndexedDB
    async adopt(k) {
      const old = lsGet(k);
      if (old === undefined) return;
      const db = await open();
      if (!db) return;
      const cur = await tx("readonly", (s) => s.get(k));
      if (cur === undefined) await tx("readwrite", (s) => s.put(old, k));
      try { localStorage.removeItem(k); } catch { /* */ }
    },
  };
})();
