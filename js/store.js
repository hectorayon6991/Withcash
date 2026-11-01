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
        t.oncomplete = () => resolve(mode === "readwrite" ? true : req?.result);
        t.onerror = t.onabort = () => resolve(mode === "readwrite" ? false : undefined);
      } catch { resolve(mode === "readwrite" ? false : undefined); }
    });
  };
  const lsGet = (k) => { try { const v = localStorage.getItem(k); return v == null ? undefined : JSON.parse(v); } catch { return undefined; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };
  window.WCStore = {
    // localStorage solo tiene la clave cuando IndexedDB falló al guardar: ahí está la copia más reciente
    async get(k, d) {
      let v = lsGet(k);
      if (v === undefined) { const db = await open(); if (db) v = await tx("readonly", (s) => s.get(k)); }
      return v === undefined ? d : v;
    },
    // Devuelve true si quedó guardado. Si IndexedDB falla (sin espacio, modo privado…) usa localStorage.
    async set(k, v) {
      const db = await open();
      if (db && await tx("readwrite", (s) => s.put(v, k))) { try { localStorage.removeItem(k); } catch { /* */ } return true; }
      return lsSet(k, v);
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
      // Lo de localStorage es lo más reciente (se escribió porque IndexedDB falló): se pasa a IndexedDB y solo
      // se borra de localStorage si quedó guardado.
      if (await tx("readwrite", (s) => s.put(old, k))) { try { localStorage.removeItem(k); } catch { /* */ } }
    },
  };
})();
