// Cobalt web service worker — caches the app shell only (HTML, CSS, JS, icons) so it opens fast, works offline and
// installs as a PWA. It never stores API responses: those are on another origin and pass straight through.
// Your data is cached separately, encrypted, in IndexedDB (js/store.js).
const VERSION = "cobalt-shell-v1";
const SHELL = [
  "./", "index.html", "style.css", "config.js", "manifest.webmanifest",
  "js/app.js", "js/state.js", "js/store.js", "js/dom.js", "js/model.js", "js/crypto.js", "js/vault.js",
  "js/tasks.js", "js/calendar.js", "js/editors.js",
  "icons/icon.svg", "icons/icon-192.png", "icons/icon-512.png", "icons/maskable-512.png", "icons/apple-touch-icon.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;   // API: never touched
  // network first (updates land on the next load), cache as the offline fallback
  e.respondWith(
    fetch(req).then((res) => {
      if (res.ok && res.type === "basic") { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || (req.mode === "navigate" ? caches.match("index.html") : Response.error()))),
  );
});
