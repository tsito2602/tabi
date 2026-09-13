/* This template is versioned and populated by build-pwa.mjs after Expo export. */
const CACHE = 'tabi-shell-__VERSION__';
const PRECACHE = __PRECACHE__;
const SHELL = '/';

function navigationResponse(response) {
  // A navigation's redirect mode is manual. Returning a followed redirect from
  // Cache Storage is rejected by browsers (ERR_FAILED), even with status 200.
  // Rebuild public HTML responses, not credentials or account data.
  return new Response(response.body, {
    status: response.status, statusText: response.statusText, headers: response.headers,
  });
}

async function repairLegacyShells() {
  for (const key of await caches.keys()) {
    if (!key.startsWith('tabi-shell-')) continue;
    const cache = await caches.open(key);
    const legacy = await cache.match('/index.html');
    if (legacy?.redirected) await cache.put('/index.html', navigationResponse(legacy));
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    // Repair the active worker's shell even while this update is still waiting.
    // Keep its original HTML/bundles so open forms are not upgraded or reloaded.
    await repairLegacyShells();
    const cache = await caches.open(CACHE);
    await cache.addAll(PRECACHE);
    const shell = await cache.match(SHELL);
    if (!shell?.ok) throw new Error('App shell was not cached');
    await cache.put(SHELL, navigationResponse(shell));
  })());
});
// An update waits until the user explicitly accepts it, preserving active forms.
self.addEventListener('message', (event) => {
  if (event.data?.type === 'ACTIVATE_UPDATE') self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = (await caches.keys()).filter((key) => key.startsWith('tabi-shell-') && key !== CACHE);
    // Retain one previous shell for tabs that still run its code.
    await Promise.all(keys.slice(0, -1).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/v1/') || url.pathname.startsWith('/__icon-check/') || url.pathname === '/sw.js') return;
  if (request.mode === 'navigate') {
    // Only the public app shell is cached. Identity/data live in account-scoped storage.
    event.respondWith((async () => {
      try {
        const cache = await caches.open(CACHE);
        const shell = (await cache.match(SHELL)) || (await cache.match('/index.html'));
        if (shell?.ok) return navigationResponse(shell);
      } catch { /* Cache access can fail in restricted browsers. Use the network. */ }
      return fetch(request);
    })());
    return;
  }
  if (PRECACHE.includes(url.pathname) || url.pathname.startsWith('/_expo/static/') || url.pathname.startsWith('/assets/')) event.respondWith(caches.open(CACHE).then(async (cache) => (await cache.match(url.pathname)) || (await caches.match(request)) || fetch(request)));
});
