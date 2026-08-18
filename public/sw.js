// BUMP THIS VERSION ON EVERY DEPLOY that changes app code.
// The activate handler deletes ALL caches whose name !== CACHE_NAME,
// forcing every browser to re-fetch JS/CSS/HTML on the next visit.
// Previous deploy was v12 — bumped to v13 to invalidate stale JS chunks
// that were causing "Application error" on mobile after the
// pwa-install-prompt fix deploy.
const CACHE_NAME = 'mesinKU-v13';

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

  // Never cache the workspace archive — it's large and changes when rebuilt.
  if (url.pathname === '/mesinKU-workspace.tar.gz') return;

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
    // Network-first for HTML pages and manifest — always get fresh content.
    // CRITICAL: never serve stale HTML from cache because it may reference
    // JS chunks that no longer exist on the server (after a new deploy),
    // which causes "Application error" on mobile.
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

    // Network-first for _next/static chunks too — if the network is
    // available, always get the fresh chunk. Only fall back to cache
    // when truly offline. This prevents serving stale JS chunks that
    // might reference old API contracts or have bugs from previous deploys.
    if (url.pathname.startsWith('/_next/static/')) {
      event.respondWith(
        fetch(event.request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        }).catch(() => caches.match(event.request).then((c) => c || Response.error()))
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
