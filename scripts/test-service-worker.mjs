import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const template = await readFile('scripts/service-worker.js', 'utf8');
// Model the URL-list metadata that real Cache Storage preserves across clones.
// A plain new Response('...') never reproduces a followed HTTP redirect.
function redirectedShell(body = 'LEGACY SHELL') {
  const response = new Response(body, { headers: { 'content-type': 'text/html' } });
  Object.defineProperties(response, {
    redirected: { value: true },
    clone: { value: () => redirectedShell(body) },
  });
  return response;
}
async function fixture({ redirectRoot = false } = {}) {
  const listeners = {}, stores = new Map(); let activated = false, claimed = false, online = true;
  const network = [], deleted = [];
  const caches = {
    async open(key) {
      if (!stores.has(key)) stores.set(key, new Map()); const store = stores.get(key);
      const keyFor = (url) => typeof url === 'string' ? url : new URL(url.url).pathname;
      return {
        async addAll(urls) { if (!online) throw new Error('offline'); for (const url of urls) store.set(url, url === '/index.html' || (url === '/' && redirectRoot) ? redirectedShell('APP SHELL') : new Response(url === '/' ? 'APP SHELL' : 'asset')); },
        async match(url) { return store.get(keyFor(url))?.clone(); },
        async put(url, response) { store.set(keyFor(url), response.clone()); },
      };
    },
    async match(request) { for (const key of stores.keys()) { const match = await (await caches.open(key)).match(request); if (match) return match; } },
    async keys() { return [...stores.keys()]; }, async delete(key) { deleted.push(key); return stores.delete(key); },
  };
  vm.runInNewContext(template.replace('__VERSION__', 'test').replace('__PRECACHE__', JSON.stringify(['/', '/app.js'])), {
    self: { addEventListener: (type, fn) => { listeners[type] = fn; }, skipWaiting: () => { activated = true; }, clients: { claim: async () => { claimed = true; } }, location: { origin: 'https://tabi.test' } },
    caches, URL, Response, fetch: async (request) => { network.push(request.url); if (!online) throw new Error('offline'); return new Response('network'); },
  });
  const lifecycle = async (name) => { let pending; listeners[name]({ waitUntil: (promise) => { pending = promise; } }); await pending; };
  const fetch = (path, options = {}) => {
    let response;
    const request = { method: 'GET', url: `https://tabi.test${path}`, mode: 'cors', redirect: 'manual', ...options };
    listeners.fetch({ request, respondWith: (value) => {
      response = Promise.resolve(value).then((result) => {
        // Service Workers Handle Fetch algorithm: redirected response +
        // redirect mode other than follow must result in a network error.
        if (request.mode === 'navigate' && request.redirect !== 'follow' && result.redirected) throw new TypeError('ERR_FAILED: redirected navigation response');
        return result;
      });
    } });
    return response;
  };
  return { lifecycle, fetch, listeners, stores, caches, network, deleted, offline: () => { online = false; }, activated: () => activated, claimed: () => claimed };
}
test('installed shell and bundles support deep-link offline reload without caching account APIs', async () => {
  const f = await fixture(); await f.lifecycle('install'); f.offline();
  assert.equal(await (await f.fetch('/trips/abc/places', { mode: 'navigate' })).text(), 'APP SHELL');
  assert.equal(await (await f.fetch('/app.js')).text(), 'asset');
  assert.equal(f.fetch('/v1/trips'), undefined);
  assert.equal(f.fetch('/v1/trips/a/places', { method: 'POST' }), undefined);
  assert.equal(f.fetch('/sw.js'), undefined);
  assert.equal(f.fetch('/__icon-check/', { mode: 'navigate' }), undefined);
  assert.equal(f.fetch('/__icon-check/test/a/icon.png'), undefined);
  assert.equal(f.network.length, 0);
});

test('redirected legacy HTML is repaired while the old worker remains active, without changing its build', async () => {
  const f = await fixture();
  f.stores.set('tabi-shell-legacy', new Map([
    ['/index.html', redirectedShell()],
    ['/_expo/static/js/web/legacy.js', new Response('legacy bundle')],
  ]));
  f.stores.set('other-app-cache', new Map([['/index.html', redirectedShell('OTHER APP')]]));
  await f.lifecycle('install');
  const oldCache = await f.caches.open('tabi-shell-legacy');
  const repaired = await oldCache.match('/index.html');
  assert.equal(repaired.redirected, false);
  assert.equal(await repaired.text(), 'LEGACY SHELL');
  assert.equal(await (await oldCache.match('/_expo/static/js/web/legacy.js')).text(), 'legacy bundle');
  assert.equal(f.activated(), false);
  assert.equal(f.claimed(), false);
  assert.deepEqual(f.deleted, []);
  assert.equal((await (await f.caches.open('other-app-cache')).match('/index.html')).redirected, true);
});

test('even redirected canonical HTML is safe for normal navigation and offline deep links', async () => {
  const f = await fixture({ redirectRoot: true });
  await f.lifecycle('install'); f.offline();
  for (const path of ['/', '/trips/abc/itinerary', '/?invite=example']) {
    const response = await f.fetch(path, { mode: 'navigate' });
    assert.equal(response.redirected, false);
    assert.equal(await response.text(), 'APP SHELL');
  }
  assert.equal(f.network.length, 0);
});

test('read-time normalization handles an existing redirected shell without requiring cache deletion', async () => {
  const f = await fixture();
  f.stores.set('tabi-shell-test', new Map([['/index.html', redirectedShell()]]));
  f.offline();
  const response = await f.fetch('/trips/abc/members', { mode: 'navigate' });
  assert.equal(response.redirected, false);
  assert.equal(response.headers.get('content-type'), 'text/html');
  assert.equal(await response.text(), 'LEGACY SHELL');
});

test('navigation still reaches the server when storage is unavailable', async () => {
  const f = await fixture();
  f.caches.open = async () => { throw new Error('Storage unavailable'); };
  assert.equal(await (await f.fetch('/', { mode: 'navigate' })).text(), 'network');
});
test('updates wait for consent and keep one previous shell for active tabs', async () => {
  const f = await fixture();
  f.stores.set('tabi-shell-old1', new Map()); f.stores.set('tabi-shell-old2', new Map([['/_expo/static/js/web/previous.js', new Response('previous bundle')]])); f.stores.set('other-app-cache', new Map());
  await f.lifecycle('install'); assert.equal(f.activated(), false);
  f.listeners.message({ data: { type: 'ACTIVATE_UPDATE' } }); assert.equal(f.activated(), true);
  await f.lifecycle('activate'); assert.equal(f.claimed(), true);
  assert.deepEqual(f.deleted, ['tabi-shell-old1']); assert.ok(f.stores.has('other-app-cache'));
  f.offline(); assert.equal(await (await f.fetch('/_expo/static/js/web/previous.js')).text(), 'previous bundle');
});
