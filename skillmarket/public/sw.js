/* SkillMarket service worker.
 *  - Precaches the app shell and every built asset (the list is injected at build time) so the app opens offline.
 *  - Navigations: network first, falling back to the cached shell (the SPA handles the route) or /offline.html.
 *  - Built assets: cache first. Fonts: stale-while-revalidate.
 *  - API calls (Supabase) and every other cross-origin request are never touched.
 */
const VERSION = 'v1';
const SHELL_CACHE = `skillmarket-shell-${VERSION}`;
const RUNTIME_CACHE = `skillmarket-runtime-${VERSION}`;
const CORE = ['/', '/offline.html', '/manifest.webmanifest', '/icon.svg', '/icons/icon-192.png', '/icons/icon-512.png'];
const BUILD_ASSETS = /*__PRECACHE_ASSETS__*/[];
const PRECACHE = new Set([...CORE, ...BUILD_ASSETS]);
const NAVIGATION_TIMEOUT_MS = 4000;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await cache.addAll(CORE);                                              // the shell must be complete
    await Promise.allSettled(BUILD_ASSETS.filter((u) => !CORE.includes(u)).map((u) => cache.add(u)));
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = new Set([SHELL_CACHE, RUNTIME_CACHE]);
    for (const name of await caches.keys()) if (!keep.has(name)) await caches.delete(name);
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (url.origin !== self.location.origin) {
    if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
      event.respondWith(staleWhileRevalidate(request));
    }
    return;                                                                 // Supabase and other APIs go straight to the network
  }
  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(request));
  } else if (url.pathname.startsWith('/assets/') || PRECACHE.has(url.pathname)) {
    event.respondWith(cacheFirst(request));
  } else {
    event.respondWith(staleWhileRevalidate(request));
  }
});

async function handleNavigation(request) {
  const fallback = async () => (await caches.match('/')) || (await caches.match('/offline.html')) || Response.error();
  try {
    const network = fetch(request);
    const timeout = new Promise((resolve) => setTimeout(() => resolve(null), NAVIGATION_TIMEOUT_MS));
    const response = await Promise.race([network, timeout]);
    if (response === null) {                                                // slow network: show the shell now
      const cached = await caches.match('/');
      return cached || (await network);
    }
    return response.status >= 500 ? await fallback() : response;
  } catch {
    return fallback();
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) (await caches.open(RUNTIME_CACHE)).put(request, response.clone());
  return response;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);
  const refresh = fetch(request).then((response) => {
    if (response.ok || response.type === 'opaque') cache.put(request, response.clone());
    return response;
  }).catch(() => null);
  return cached || (await refresh) || Response.error();
}
