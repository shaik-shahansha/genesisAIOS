/**
 * Genesis OS — PWA Service Worker
 *
 * Strategy:
 *  - Cache-first for static assets (JS, CSS, fonts, images, icons)
 *  - Network-first with cache fallback for navigation (HTML)
 *  - Network-only for all /api/* calls (never cache API responses)
 *
 * This SW is separate from proxy-sw.js (which handles iframe proxy routing).
 */

const CACHE_VERSION = 'genesis-os-v1';
const STATIC_CACHE  = `${CACHE_VERSION}-static`;
const NAV_CACHE     = `${CACHE_VERSION}-nav`;

// Assets to pre-cache on install
const PRECACHE_ASSETS = [
  '/',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

// ── Install ───────────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) =>
      cache.addAll(PRECACHE_ASSETS).catch(() => {
        // Non-fatal: partial precache is fine
      })
    ).then(() => self.skipWaiting())
  );
});

// ── Activate ──────────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k.startsWith('genesis-os-') && k !== STATIC_CACHE && k !== NAV_CACHE)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch ─────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Never intercept non-GET, cross-origin, or API requests
  if (request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  // Navigation requests (HTML) — network-first, cache fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          // Update cache in background
          const clone = res.clone();
          caches.open(NAV_CACHE).then((cache) => cache.put(request, clone));
          return res;
        })
        .catch(() =>
          caches.match(request).then((cached) => cached || caches.match('/'))
        )
    );
    return;
  }

  // Static assets — cache-first, network fallback with background update
  event.respondWith(
    caches.match(request).then((cached) => {
      const networkFetch = fetch(request).then((res) => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(STATIC_CACHE).then((cache) => cache.put(request, clone));
        }
        return res;
      }).catch(() => cached); // fallback to cache if network fails

      return cached || networkFetch;
    })
  );
});

// ── Message: skipWaiting (for update flow) ────────────────────────────────────
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
