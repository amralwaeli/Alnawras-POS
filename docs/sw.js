/**
 * AlnawrasPOS Service Worker
 *
 * Goal: the installed APK / PWA must always pick up the latest deploy WITHOUT a
 * reinstall, while still opening when the network is down.
 *
 * Strategy:
 *  - HTML navigations  → network-first (always fetch the freshest index.html so
 *    the app loads the newest hashed assets; fall back to cache when offline).
 *  - Static assets     → cache-first (Vite filenames are content-hashed, so a
 *    new build produces new names — cached old files are simply never requested).
 *  - On activate       → delete caches from previous versions and take control
 *    of open pages immediately (skipWaiting + clients.claim).
 *
 * Bump CACHE_NAME whenever this file changes to flush the old cache.
 */
const CACHE_NAME = 'alnawras-pos-v2';

// Base path the SW is served from, e.g. "/Alnawras-POS/". Derived from the SW's
// own location so it works under any GitHub Pages project path.
const BASE = new URL('./', self.location.href).pathname;
const SHELL_URL = BASE + 'index.html';

self.addEventListener('install', (event) => {
  // Don't wait for old tabs to close — apply the new SW right away.
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll([BASE, SHELL_URL]).catch(() => {/* offline at install — ignore */})
    )
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Never touch cross-origin requests (Supabase, QR API, etc.) — let them hit
  // the network directly so data is never served stale.
  if (url.origin !== self.location.origin) return;

  // Network-first for page navigations so the latest shell always wins online.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(SHELL_URL, copy));
          return res;
        })
        .catch(() => caches.match(SHELL_URL).then((r) => r || caches.match(BASE)))
    );
    return;
  }

  // Cache-first for hashed static assets (fast + works offline).
  event.respondWith(
    caches.match(req).then((cached) =>
      cached ||
      fetch(req).then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, copy));
        }
        return res;
      })
    )
  );
});
