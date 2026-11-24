const CACHE_NAME = 'far-aim-online-v2';
const DATA_CACHE_NAME = 'far-aim-online-data-v2';
const IMAGE_CACHE_NAME = 'far-aim-online-images-v2';
const MAX_DATA_CACHE_ENTRIES = 160;
const MAX_IMAGE_CACHE_ENTRIES = 120;
const ACTIVE_CACHES = new Set([CACHE_NAME, DATA_CACHE_NAME, IMAGE_CACHE_NAME]);

const STATIC_PRECACHE = [
  '/',
  '/manifest.webmanifest',
  '/apple-touch-icon.png',
  '/app-icon-192.png',
  '/app-icon-512.png',
  '/app-icon.svg',
  '/favicon.svg',
];

async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= maxEntries) return;
  const overflow = keys.length - maxEntries;
  await Promise.all(keys.slice(0, overflow).map((key) => cache.delete(key)));
}

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_PRECACHE))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => !ACTIVE_CACHES.has(key)).map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Skip external origins
  if (url.origin !== self.location.origin) return;

  // Let the browser download installers without caching them or returning HTML offline.
  if (url.pathname.startsWith('/downloads/')) return;

  // Navigation requests: Network-first with cache fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          return (await caches.match('/')) || new Response('Offline', { status: 503 });
        })
    );
    return;
  }

  // Hashed assets and immutable search assets: Cache-first with bounded LRU storage
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/search/')) {
    event.respondWith(
      caches.open(DATA_CACHE_NAME).then((cache) =>
        cache.match(request).then((cached) => {
          if (cached) return cached;
          return fetch(request).then((response) => {
            if (response.status === 200) {
              const clone = response.clone();
              cache.put(request, clone).then(() => trimCache(DATA_CACHE_NAME, MAX_DATA_CACHE_ENTRIES));
            }
            return response;
          });
        })
      )
    );
    return;
  }

  // Reference figures: Cache-first with bounded LRU storage
  if (url.pathname.startsWith('/aim/images/') || url.pathname.startsWith('/far/images/')) {
    event.respondWith(
      caches.open(IMAGE_CACHE_NAME).then((cache) =>
        cache.match(request).then((cached) => {
          if (cached) return cached;
          return fetch(request).then((response) => {
            if (response.status === 200) {
              const clone = response.clone();
              cache.put(request, clone).then(() => trimCache(IMAGE_CACHE_NAME, MAX_IMAGE_CACHE_ENTRIES));
            }
            return response;
          }).catch(() => new Response('Offline', { status: 503 }));
        })
      )
    );
    return;
  }

  // Stale-while-revalidate for static files
  event.respondWith(
    caches.match(request).then((cached) => {
      const fetchPromise = fetch(request).then((networkResponse) => {
        if (networkResponse.status === 200) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return networkResponse;
      }).catch(() => cached || new Response('Offline', { status: 503 }));

      return cached || fetchPromise;
    })
  );
});
