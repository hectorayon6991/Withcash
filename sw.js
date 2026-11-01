// WithCash service worker: la app funciona sin conexión (los datos se sincronizan con Supabase).
const VERSION = "wc-v2.5.1";
const SHELL = [
  "./", "index.html", "css/styles.css", "js/app.js", "js/config.js", "js/vendor/supabase.js",
  "js/icons.js", "js/finance.js", "js/store.js", "manifest.webmanifest", "icons/icon.svg", "icons/icon-192.png", "icons/apple-touch-icon.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});
// Mismo origen: red primero (para recibir actualizaciones) y caché si no hay conexión.
// Peticiones a Supabase u otros orígenes: no se tocan.
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request, { cache: "no-cache" })   // revalida siempre: nunca mezcla archivos de versiones distintas
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match("index.html"))),
  );
});
