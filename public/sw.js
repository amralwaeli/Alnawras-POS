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
const CACHE_NAME = 'smartpos-v4';

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

// The page asks for this whenever it is online: download every file of the current
// build (precache.json, written by vite.config.ts) so all screens open offline.
// Old builds' files are removed only when the asking page IS the current build,
// so a page still running an older build never loses its own screens.
self.addEventListener('message', (event) => {
  if (event.data?.type !== 'precache') return;
  event.waitUntil(precacheAll(event.data.current));
});

async function precacheAll(currentScript) {
  const res = await fetch(BASE + 'precache.json', { cache: 'no-store' });
  if (!res.ok) return;
  const files = (await res.json()).map((f) => BASE + f);
  const cache = await caches.open(CACHE_NAME);
  const have = new Set((await cache.keys()).map((r) => new URL(r.url).pathname));
  for (const f of files) {
    if (!have.has(f)) { try { await cache.add(f); } catch { /* retried next time */ } }
  }
  const keep = new Set(files);
  if (!currentScript || !keep.has(new URL(currentScript).pathname)) return;
  for (const r of await cache.keys()) {
    const p = new URL(r.url).pathname;
    if (p.startsWith(BASE + 'assets/') && !keep.has(p)) await cache.delete(r);
  }
}

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
    caches.match(req, { ignoreVary: true }).then((cached) =>
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
