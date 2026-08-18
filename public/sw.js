// BUMP THIS VERSION ON EVERY DEPLOY that changes app code.
// The activate handler deletes ALL caches whose name !== CACHE_NAME,
// forcing every browser to re-fetch JS/CSS/HTML on the next visit.
//
// v14 → v15: PRECACHE critical /api/ endpoints during SW install so the
// offline cache is populated the moment the new SW activates — no need
// for the user to browse around first. This fixes "kategori & iklan tidak
// muncul saat offline" even on the first offline visit after SW update.
const CACHE_NAME = 'mesinKU-v15';

// Static assets to pre-cache for PWA installability
const PRECACHE_STATIC = [
  '/manifest.json',
  '/pwa-icon-192.png',
  '/pwa-icon-512.png',
];

// Critical API endpoints that the home page fetches on load.
// Pre-caching these during install guarantees the offline cache is
// populated immediately when the new SW activates — the user does NOT
// need to browse around online first before going offline.
//
// These URLs MUST match exactly what home.tsx requests (query strings
// included) because Cache API matches on the full URL.
const PRECACHE_API = [
  '/api/categories',
  '/api/listings?sort=newest&limit=48',
  '/api/listings?packageType=spotlight&limit=8&sort=newest',
  '/api/listings?packageType=spotlight&limit=12&sort=popular',
  '/api/listings?packageType=highlight&limit=8&sort=newest',
  '/api/listings?condition=baru&sort=newest&limit=24',
  '/api/listings?condition=jasa&sort=newest&limit=24',
  '/api/listings/most-searched?limit=12',
  '/api/admin/hero-banner',
  '/api/admin/banner',
  '/api/admin/banner-2',
  '/api/admin/banner-3',
];

// Install: pre-cache static assets + critical API endpoints
// CRITICAL: API precache is best-effort (allSettled) so one failing
// endpoint (e.g. 401 auth) doesn't block the SW from installing.
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      // Static assets — fail silently if any 404s
      await cache.addAll(PRECACHE_STATIC).catch(() => {});
      // Critical API endpoints — best-effort, individual fetches
      await Promise.allSettled(
        PRECACHE_API.map(async (url) => {
          try {
            const res = await fetch(url);
            if (
              res.ok &&
              (res.headers.get('content-type') || '').includes('application/json')
            ) {
              await cache.put(url, res.clone());
            }
          } catch {
            /* network failure during install — ignore, will cache on first fetch */
          }
        })
      );
    })()
  );
  // Activate immediately — don't wait for all tabs to close
  self.skipWaiting();
});

// Activate: clean old caches and claim all clients immediately
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

  // GET /api/ requests: network-first, fall back to cache when offline.
  // This makes categories & listings available offline (PWA requirement).
  // POST/PUT/DELETE are never cached (method check above already returned).
  // CRITICAL: only cache successful (ok) responses with JSON content-type
  // to avoid caching error responses or auth-protected payloads.
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const ct = response.headers.get('content-type') || '';
            if (ct.includes('application/json')) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
            }
          }
          return response;
        })
        .catch(() =>
          caches.match(event.request).then(
            (cached) =>
              cached ||
              new Response(JSON.stringify({ error: 'offline', message: 'Anda sedang offline. Data tidak tersedia.' }), {
                status: 503,
                headers: { 'Content-Type': 'application/json' },
              })
          )
        )
    );
    return;
  }

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
