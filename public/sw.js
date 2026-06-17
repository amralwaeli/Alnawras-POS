const CACHE_NAME = 'alnawras-pos-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/alnawras-logo.png',
  // Note: Vite hashed assets will be added by the build process in a real PWA setup.
  // For this manual addition, we focus on the core shell.
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

self.addEventListener('fetch', (event) => {
  // Only cache GET requests
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request).catch(() => {
        // Fallback for navigation requests
        if (event.request.mode === 'navigate') {
          return caches.match('/index.html');
        }
      });
    })
  );
});
