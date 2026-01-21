const CACHE = 'gd-static-v1';
const PRECACHE = [
  './',
  './index.html',
  'assets/images/20260117_1741_Image Generation_remix_01kf66dgt0e2qbb8m6ngnmn416.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.map((k) => (k !== CACHE ? caches.delete(k) : null))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const isSameOrigin = url.origin === self.location.origin;

  // кешируем только статику same-origin
  const isStatic =
    ['image', 'script', 'style', 'font'].includes(req.destination) ||
    url.pathname.endsWith('.png') || url.pathname.endsWith('.jpg') || url.pathname.endsWith('.jpeg') ||
    url.pathname.endsWith('.webp') || url.pathname.endsWith('.svg') || url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.js');

  if (!isSameOrigin || !isStatic) return;

  event.respondWith(
    caches.match(req).then((cached) => {
      const net = fetch(req).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => cached);

      return cached || net;
    })
  );
});
