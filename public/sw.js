const CACHE_NAME = 'gomesin-v7';

// Critical URLs to pre-cache for PWA installability
const PRECACHE_URLS = [
  '/manifest.json',
  '/pwa-icon-192.png',
  '/pwa-icon-512.png',
];

// Install: pre-cache critical assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => 
      cache.addAll(PRECACHE_URLS).catch(() => {})
    )
  );
  self.skipWaiting();
});

// Activate: clean old caches and claim all clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Listen for messages from the app
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Fetch strategy
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  // Never cache API calls — always network
  if (url.pathname.startsWith('/api/')) return;

  // Cache-first for images (chatglm CDN, img-proxy, local listing images)
  if (
    url.hostname.includes('chatglm.cn') ||
    url.hostname.includes('vercel-storage') ||
    url.pathname.startsWith('/listing-images/') ||
    url.pathname.startsWith('/cat-icons/') ||
    url.pathname.startsWith('/pwa-icon-')
  ) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        cache.match(event.request).then((cached) => {
          if (cached) return cached;
          return fetch(event.request).then((response) => {
            if (response.ok) {
              const clone = response.clone();
              cache.put(event.request, clone);
            }
            return response;
          }).catch(() => cached);
        })
      )
    );
    return;
  }

  // Same-origin requests
  if (url.hostname === self.location.hostname) {
    // Network-first for HTML pages and manifest — always get fresh content
    if (
      url.pathname === '/' ||
      url.pathname === '/manifest.json' ||
      url.pathname.endsWith('.html') ||
      !url.pathname.includes('.')
    ) {
      event.respondWith(
        fetch(event.request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        }).catch(() => caches.match(event.request))
      );
      return;
    }

    // Stale-while-revalidate for JS/CSS/static assets
    event.respondWith(
      caches.match(event.request).then((cached) => {
        const fetched = fetch(event.request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        }).catch(() => cached);
        return cached || fetched;
      })
    );
  }
});
