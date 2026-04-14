/**
 * Genesis OS Browser Proxy Service Worker
 *
 * Intercepts ALL fetch/navigation requests triggered from within proxied
 * iframe pages and routes them through /api/browse/proxy.
 *
 * Handles two cases:
 *  1. External URL requests (https://other-domain.com) — route through proxy.
 *  2. Same-origin navigation requests that originated from a proxied page
 *     (e.g. JS does window.location = '/path') — reconstruct absolute URL
 *     from Referer and route through proxy.
 */

const PROXY_ORIGIN = self.location.origin;
const PROXY_PATH   = '/api/browse/proxy';
const PROXY_API    = `${PROXY_ORIGIN}${PROXY_PATH}`;

// ── helpers ──────────────────────────────────────────────────────────────────

function isExternal(url) {
  return (url.startsWith('http://') || url.startsWith('https://')) &&
         !url.startsWith(PROXY_ORIGIN);
}

/**
 * If the referrer was a proxied page, return the real URL it was proxying.
 * Referrer looks like: http://localhost:3000/api/browse/proxy?url=https://...
 */
function getRealBaseFromReferrer(referrerStr) {
  if (!referrerStr) return null;
  try {
    const ref = new URL(referrerStr);
    if (ref.pathname === PROXY_PATH && ref.searchParams.has('url')) {
      return ref.searchParams.get('url');
    }
  } catch { /* ignore */ }
  return null;
}

// ── lifecycle ─────────────────────────────────────────────────────────────────

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

// ── fetch interception ───────────────────────────────────────────────────────

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const urlStr = request.url;

  // ── Case 1: external URL — always proxy ───────────────────────────────────
  if (isExternal(urlStr)) {
    const proxyUrl = `${PROXY_API}?url=${encodeURIComponent(urlStr)}`;

    if (request.mode === 'navigate') {
      // Redirect keeps the iframe URL on localhost so SW stays in control
      event.respondWith(Promise.resolve(Response.redirect(proxyUrl, 302)));
    } else {
      event.respondWith(
        fetch(proxyUrl, {
          method:  request.method,
          headers: { Accept: request.headers.get('accept') || '*/*' },
          body:    ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
          redirect: 'follow',
          signal:  AbortSignal.timeout(30_000),
        }).catch((err) => new Response(`Proxy SW error: ${err.message}`, { status: 502 }))
      );
    }
    return;
  }

  // ── Case 2: same-origin navigation from a proxied page ───────────────────
  // Happens when JS does: window.location = '/some/path'
  // The URL lands on localhost:3000 but the path belongs to the remote site.
  if (request.mode === 'navigate') {
    const reqUrl = new URL(urlStr);

    // Skip if it's already hitting our API or real app routes
    if (reqUrl.pathname.startsWith('/api/') || reqUrl.pathname === '/' ||
        reqUrl.pathname.startsWith('/assets/') || reqUrl.pathname.startsWith('/src/')) {
      return;
    }

    const realBase = getRealBaseFromReferrer(request.referrer);
    if (realBase) {
      try {
        // Reconstruct the absolute URL using the remote site as the base
        const absolute = new URL(reqUrl.pathname + reqUrl.search + reqUrl.hash, realBase).toString();
        const proxyUrl = `${PROXY_API}?url=${encodeURIComponent(absolute)}`;
        event.respondWith(Promise.resolve(Response.redirect(proxyUrl, 302)));
        return;
      } catch { /* fall through */ }
    }
  }

  // ── Case 3: same-origin sub-resource from a proxied page ─────────────────
  // e.g. fetch('/api/data') or XHR to a local-looking path from a remote page
  if (request.mode !== 'navigate') {
    const reqUrl = new URL(urlStr);
    if (!reqUrl.pathname.startsWith('/api/') && !reqUrl.pathname.startsWith('/assets/') &&
        !reqUrl.pathname.startsWith('/src/')) {
      const realBase = getRealBaseFromReferrer(request.referrer);
      if (realBase) {
        try {
          const absolute = new URL(reqUrl.pathname + reqUrl.search, realBase).toString();
          const proxyUrl = `${PROXY_API}?url=${encodeURIComponent(absolute)}`;
          event.respondWith(
            fetch(proxyUrl, {
              method:  request.method,
              headers: { Accept: request.headers.get('accept') || '*/*' },
              body:    ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
              redirect: 'follow',
              signal:  AbortSignal.timeout(30_000),
            }).catch((err) => new Response(`SW error: ${err.message}`, { status: 502 }))
          );
          return;
        } catch { /* fall through */ }
      }
    }
  }
});

