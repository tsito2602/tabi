import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { build } from 'esbuild';

// Exercise the real provider while React state updates wait for the next render.
// Transport responses are controlled separately, as they are in a mounted app.
const { outputFiles } = await build({
  entryPoints: ['src/data/travel-provider.tsx'], bundle: true, write: false,
  platform: 'node', format: 'cjs', jsx: 'automatic', logLevel: 'silent',
  external: ['react', 'react/jsx-runtime', 'react-native', 'expo-crypto'],
  plugins: [{ name: 'provider-boundaries', setup(builder) {
    builder.onResolve({ filter: /^(@\/auth\/auth-provider|\.\/cache|\.\/demo-documents)$/ }, ({ path }) => ({ path, external: true }));
  } }],
});
const providerCode = outputFiles[0].text;
const filterBuild = await build({ entryPoints: ['src/data/preparation-filter.ts'], bundle: true, write: false, platform: 'node', format: 'cjs', logLevel: 'silent' });
const filterModule = { exports: {} };
new Function('module', 'exports', filterBuild.outputFiles[0].text)(filterModule, filterModule.exports);
const { matchesPreparationFilter, preparationFilterOptions } = filterModule.exports;

test('shared packing has one record, appears under its carrier and shared filters, and survives local storage', async () => {
  const f = await fixture({ isDemo: true });
  try {
    const input = { name: '充電器', category: '電子機器', quantity: 1, packed: false, assignee: 'member:one', shared: true };
    const id = f.api.createPackingItem(input);
    f.api.createPackingItem({ ...input, name: 'パスポート', shared: false, assignee: 'member:two' });
    const items = f.render().packingItems;
    assert.equal(items.filter((item) => matchesPreparationFilter(item, { kind: 'all' })).length, 2);
    assert.equal(items.filter((item) => matchesPreparationFilter(item, { kind: 'shared' })).length, 1);
    assert.equal(items.filter((item) => matchesPreparationFilter(item, { kind: 'assignee', value: 'member:one' })).length, 1);
    assert.equal(matchesPreparationFilter({}, { kind: 'assignee', value: '' }), true, 'legacy packing is unassigned');
    assert.equal(matchesPreparationFilter({ assignee: 'member:two' }, { kind: 'assignee', value: 'member:one' }), false);
    f.api.updatePackingItem(id, { ...input, packed: true });
    assert.equal(f.render().packingItems.find((item) => item.id === id).packed, true);
    assert.deepEqual(f.writes.at(-1).packingByTrip.trip.find((item) => item.id === id), { id, ...input, packed: true });
    const options = preparationFilterOptions([{ id: 'one', name: '新しい名前' }], [...items, { assignee: '旧担当' }], true);
    assert.equal(options.find((option) => option.key === 'member:one').label, '新しい名前');
    assert.ok(options.some((option) => option.key === 'member:two'), 'departed or not-yet-loaded members remain selectable');
    assert.ok(options.some((option) => option.key === '旧担当'), 'legacy task names remain selectable');
    assert.equal(preparationFilterOptions([], [], false).some((option) => option.key === 'shared'), false);
  } finally { f.close(); }
});
const tick = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};
const trip = { id: 'trip', name: 'Travel', destination: '', startsOn: '2026-11-21', endsOn: '2026-11-28', role: 'owner', memberCount: 1 };
const task = { id: 'task', title: 'Pack', dueOn: '', assignee: '', done: false };
const empty = () => ({ version: 1, trips: [trip], selectedTripId: trip.id, itemsByTrip: {}, bookingsByTrip: {}, documentsByBooking: {}, packingByTrip: {}, tasksByTrip: { trip: [task] }, placesByTrip: {}, pending: [] });

async function fixture({ stored = empty(), transport, isDemo = false } = {}) {
  let cursor = 0;
  let mounted = false;
  const slots = [];
  const effects = [];
  const writes = [];
  const requests = [];
  const alerts = [];
  const scopes = [];
  const documents = new Map();
  const serverTasks = [structuredClone(task)];
  const serverTrips = [structuredClone(trip)];
  const request = async (path, init = {}) => {
    requests.push({ path, ...init });
    // Bound a regression that would otherwise spin forever without a render.
    if (requests.length > 40) throw new Error('repeated transport requests');
    if (transport) {
      const handled = await transport(path, init);
      if (handled !== undefined) return handled;
    }
    if (init.method === 'PATCH' && path.endsWith('/tasks/task')) Object.assign(serverTasks[0], JSON.parse(init.body));
    if (init.method === 'POST' && path === '/v1/trips') serverTrips.push(JSON.parse(init.body));
    if (init.method) return {};
    if (path === '/v1/trips') return { trips: structuredClone(serverTrips) };
    if (path.endsWith('/tasks')) return { tasks: structuredClone(serverTasks) };
    if (path.endsWith('/places')) return { places: [] };
    if (path.endsWith('/bookings')) return { bookings: [] };
    if (path.endsWith('/booking-documents')) return { documents: [] };
    return { items: [] };
  };
  const react = {
    createContext: () => ({ Provider: 'provider' }),
    useState(initial) {
      const index = cursor++;
      slots[index] ??= { value: typeof initial === 'function' ? initial() : initial, pending: [] };
      const slot = slots[index];
      for (const update of slot.pending.splice(0)) slot.value = typeof update === 'function' ? update(slot.value) : update;
      return [slot.value, (update) => slot.pending.push(update)];
    },
    useRef(initial) { const index = cursor++; return slots[index] ??= { current: initial }; },
    useCallback: (fn) => fn,
    useMemo: (fn) => fn(),
    useEffect: (effect) => { if (!mounted) effects.push(effect); },
    useContext: () => { throw new Error('read the rendered provider value'); },
  };
  const boundaries = {
    react,
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }) },
    'react-native': { Alert: { alert: (...args) => alerts.push(args) }, Platform: { OS: 'ios' }, AppState: { addEventListener: () => ({ remove() {} }) } },
    'expo-crypto': { randomUUID },
    './demo-documents': { saveDemoDocument: async (id, bytes) => documents.set(id, bytes), loadDemoDocument: async (id) => documents.get(id) },
    '@/auth/auth-provider': { useAuth: () => ({ request, requestRaw: request, isDemo }) },
    './cache': { loadTravelCache: async (scope) => { scopes.push(scope); return structuredClone(stored); }, saveTravelCache: async (value, scope) => { scopes.push(scope); writes.push(structuredClone(value)); } },
  };
  const module = { exports: {} };
  new Function('require', 'module', 'exports', 'setInterval', 'clearInterval', providerCode)(
    (name) => { assert.ok(name in boundaries, `unexpected dependency ${name}`); return boundaries[name]; },
    module, module.exports, () => 0, () => {},
  );
  const render = () => { cursor = 0; return module.exports.TravelProvider({ children: null }).props.value; };
  render();
  mounted = true;
  const cleanups = effects.map((effect) => effect());
  await tick();
  const api = render();
  requests.length = 0;
  return { api, render, requests, writes, alerts, scopes, close: () => cleanups.forEach((cleanup) => cleanup?.()) };
}

test('create a trip and immediately add plans to that trip before a render', async () => {
  const f = await fixture();
  try {
    const id = f.api.createTrip({ ...trip, name: 'New trip' });
    f.api.createItem({ day: '2026-11-21', time: '10:00', kind: 'spot', title: 'One', note: '' });
    f.api.createItem({ day: '2026-11-21', time: '11:00', kind: 'spot', title: 'Two', note: '' });
    await tick();
    assert.deepEqual(f.requests.filter((r) => r.method === 'POST').map((r) => r.path), [
      '/v1/trips', `/v1/trips/${id}/items`, `/v1/trips/${id}/items`,
    ]);
    assert.equal(f.writes.at(-1).pending.length, 0);
  } finally { f.close(); }
});

test('send and acknowledge each queued delete once without waiting for React', async () => {
  const f = await fixture();
  try {
    f.api.deleteItem('one'); f.api.deleteItem('two');
    f.render();
    await tick();
    assert.deepEqual(f.requests.filter((r) => r.method).map((r) => r.path), ['/v1/trips/trip/items/one', '/v1/trips/trip/items/two']);
    assert.equal(f.writes.at(-1).pending.length, 0);
  } finally { f.close(); }
});

test('an edit during a snapshot is sent immediately and the stale snapshot is discarded', async () => {
  const gate = deferred();
  let hold = false;
  const f = await fixture({ transport: async (path, init) => {
    if (hold && !init.method && path.endsWith('/tasks')) {
      hold = false;
      await gate.promise;
      return { tasks: [structuredClone(task)] };
    }
  } });
  try {
    hold = true;
    const running = f.api.sync();
    await tick();
    f.api.updateTask(task.id, { ...task, done: true });
    f.render();
    await tick();
    gate.resolve();
    await running;
    assert.equal(f.requests.filter((r) => r.method === 'PATCH').length, 1);
    assert.equal(f.writes.at(-1).tasksByTrip.trip[0].done, true);
    assert.equal(f.writes.at(-1).pending.length, 0);
  } finally { gate.resolve(); f.close(); }
});

test('concurrent callers wait for the running sync instead of resolving early', async () => {
  const gate = deferred();
  let hold = false;
  const f = await fixture({ transport: async (path) => {
    if (hold && path === '/v1/trips') await gate.promise;
  } });
  try {
    hold = true;
    const first = f.api.sync();
    let completed = false;
    const second = f.api.sync().then(() => { completed = true; });
    await tick();
    assert.equal(completed, false);
    gate.resolve();
    await Promise.all([first, second]);
    assert.equal(f.requests.filter((r) => r.path === '/v1/trips').length, 1);
  } finally { gate.resolve(); f.close(); }
});

test('a network failure keeps unacknowledged operations and retries them in order', async () => {
  let fail = true;
  const f = await fixture({ transport: async (path, init) => {
    if (fail && init.method === 'DELETE' && path.endsWith('/two')) throw new Error('offline');
  } });
  try {
    f.api.deleteItem('one'); f.api.deleteItem('two');
    f.render();
    await tick();
    assert.equal(f.render().error, 'offline');
    assert.deepEqual(f.writes.at(-1).pending.map((r) => r.path), ['/v1/trips/trip/items/two']);
    fail = false;
    await f.api.sync();
    assert.deepEqual(f.requests.filter((r) => r.method).map((r) => r.path), [
      '/v1/trips/trip/items/one', '/v1/trips/trip/items/two', '/v1/trips/trip/items/two',
    ]);
    assert.equal(f.writes.at(-1).pending.length, 0);
    assert.equal(f.render().error, null);
  } finally { f.close(); }
});


test('sample mode stores edits separately and never sends them to the API', async () => {
  const f = await fixture({ isDemo: true });
  try {
    f.api.createItem({ day: '2026-11-21', time: '10:00', kind: 'spot', title: 'Sample', note: '' });
    f.api.updateTask(task.id, { ...task, done: true });
    const bookingId = f.api.createBooking({ kind: 'hotel', title: 'Sample hotel', detail: '', origin: '', originCode: '', destination: '', destinationCode: '', day: '2026-11-21', endDay: '2026-11-22', time: '15:00', endTime: '11:00', confirmationCode: '', note: '' });
    const bytes = new TextEncoder().encode('%PDF-1.7 sample fixture').buffer;
    const document = await f.api.uploadBookingDocument(bookingId, { filename: 'sample.pdf', contentType: 'application/pdf', size: bytes.byteLength, bytes });
    assert.deepEqual(await f.api.downloadBookingDocument(bookingId, document.id), bytes);
    await f.api.sync();
    assert.equal(f.requests.length, 0);
    assert.equal(f.writes.at(-1).pending.length, 0);
    assert.equal(f.writes.at(-1).tasksByTrip.trip[0].done, true);
    assert.equal(f.writes.at(-1).documentsByBooking[bookingId][0].filename, 'sample.pdf');
    assert.ok(f.scopes.every((scope) => scope === 'demo'));
  } finally { f.close(); }
});

test('places survive offline edits, queue exactly once, and remain separate from bookings', async () => {
  const f = await fixture({ isDemo: true });
  try {
    const input = { title: 'Museum', note: 'Gallery', openingHours: '10–18', reservationStatus: 'unavailable', referenceLinks: [{ label: '公式サイト', url: 'https://museum.example/' }, { label: '', url: 'https://museum.example/exhibitions' }], location: 'https://maps.app.goo.gl/example', status: 'want' };
    const id = f.api.createPlace(input);
    f.api.updatePlace(id, { ...input, status: 'visited' });
    assert.equal(f.render().places[0].status, 'visited');
    assert.equal(f.render().places[0].reservationStatus, 'unavailable');
    assert.deepEqual(f.render().places[0].referenceLinks, input.referenceLinks);
    assert.deepEqual(f.writes.at(-1).placesByTrip.trip[0].referenceLinks, input.referenceLinks);
    assert.equal(f.render().bookings.length, 0);
    f.api.deletePlace(id);
    assert.equal(f.render().places.length, 0);
    assert.equal(f.requests.length, 0);
  } finally { f.close(); }
});

test('owner deletion removes trip collections; editors cannot delete', async () => {
  const stored = empty(); stored.placesByTrip.trip = [{ id: 'place', title: 'Place' }];
  const f = await fixture({ stored, isDemo: true });
  try {
    await f.api.deleteTrip('trip');
    assert.equal(f.render().trips.length, 0);
    assert.deepEqual(f.writes.at(-1).placesByTrip, {});
    assert.deepEqual(f.writes.at(-1).tasksByTrip, {});
  } finally { f.close(); }
  const other = empty(); other.trips[0] = { ...trip, role: 'editor' };
  const editor = await fixture({ stored: other, isDemo: true });
  try { await assert.rejects(editor.api.deleteTrip('trip')); assert.equal(editor.render().trips.length, 1); }
  finally { editor.close(); }
});

test('a revoked queued edit is removed and cannot block another trip or stale optimistic data', async () => {
  const stored = empty();
  stored.pending = [
    { id: 'revoked-1', method: 'PATCH', path: '/v1/trips/trip/tasks/task', body: { title: 'Not allowed' } },
    { id: 'revoked-2', method: 'POST', path: '/v1/trips/trip/items', body: { title: 'Also not allowed' } },
    { id: 'allowed', method: 'PATCH', path: '/v1/trips/other/tasks/task', body: { title: 'Allowed' } },
  ];
  const sent = [];
  const f = await fixture({ stored, transport: async (path, init) => {
    if (init.method) {
      sent.push(path);
      if (path.startsWith('/v1/trips/trip/')) throw Object.assign(new Error('閲覧のみ'), { status: 403 });
      return {};
    }
    if (path === '/v1/trips') return { trips: [{ ...trip, role: 'viewer' }] };
  } });
  try {
    await f.api.sync();
    const current = f.render();
    assert.equal(current.pendingCount, 0);
    assert.equal(current.canEdit, false);
    assert.equal(current.tasks[0].title, task.title);
    assert.ok(sent.includes('/v1/trips/other/tasks/task'));
    assert.ok(!sent.includes('/v1/trips/trip/items'));
    assert.throws(() => current.updateTask('task', task), /閲覧のみ/);
    assert.throws(() => current.createPlace({ title: 'Test' }), /閲覧のみ/);
  } finally { f.close(); }
});

test('notes persist offline, reopen and delete without affecting another trip', async () => {
  const f = await fixture({ isDemo: true });
  try {
    const id = randomUUID();
    f.api.saveNote(id, { body: '旅のメモ\n☐ 切符', pinned: false });
    f.api.saveNote(id, { body: '旅のメモ\n☑ 切符', pinned: true });
    assert.equal(f.render().notes.length, 1);
    assert.equal(f.render().notes[0].pinned, true);
    assert.equal(f.writes.at(-1).notesByTrip.trip[0].body, '旅のメモ\n☑ 切符');
    const next = f.api.createTrip({ name: '別の旅', destination: '', startsOn: '2026-12-01', endsOn: '2026-12-02' });
    assert.equal(f.render().notes.length, 0);
    f.api.selectTrip('trip');
    assert.equal(f.render().notes[0].id, id);
    f.api.deleteNote(id);
    assert.equal(f.render().notes.length, 0);
    assert.ok(next);
  } finally { f.close(); }
});

test('category and transport metadata persist offline, enqueue and survive local edits', async () => {
  const gate = deferred();
  const f = await fixture({ transport: async (path, init) => init.method ? gate.promise : undefined });
  try {
    const details = { category: 'transport', location: '', endDay: '', endTime: '', transport: { mode: 'walk', origin: 'ホテル', destination: '美術館', durationMinutes: 20 } };
    const id = f.api.createItem({ day: trip.startsOn, time: '', kind: '予定', title: '朝の散歩', note: '', details });
    f.api.updateItem(id, { day: trip.startsOn, time: '09:00', kind: '予定', title: '朝の散歩', note: '入口で集合', details });
    const saved = f.writes.at(-1);
    assert.deepEqual(saved.itemsByTrip.trip.find((item) => item.id === id).details, details);
    assert.deepEqual(saved.pending.filter((entry) => entry.path.includes('/items')).map((entry) => entry.body.details), [details, details]);
    const restored = await fixture({ stored: saved, isDemo: true });
    try { assert.deepEqual(restored.api.items.find((item) => item.id === id).details, details); } finally { restored.close(); }
  } finally { gate.resolve({}); f.close(); }
});

test('transport ordering and durations handle untimed, overnight and removed preceding plans', async () => {
  const { outputFiles } = await build({ entryPoints: ['src/data/itinerary.ts'], bundle: true, write: false, platform: 'node', format: 'cjs', logLevel: 'silent' });
  const module = { exports: {} };
  new Function('module', 'exports', outputFiles[0].text)(module, module.exports);
  const { orderItineraryEntries, durationMinutes, itemDetails } = module.exports;
  const a = { key: 'item-a', day: '2026-11-21', time: '' };
  const b = { key: 'item-b', day: a.day, time: '' };
  const details = { category: 'transport', location: '', endDay: '', endTime: '', transport: { mode: 'walk', origin: 'A', destination: 'B', durationMinutes: 20, afterKey: a.key } };
  const move = { key: 'item-c', day: a.day, time: '', item: { day: a.day, time: '', details } };
  assert.deepEqual(orderItineraryEntries([b, move, a]).map((entry) => entry.key), ['item-a', 'item-c', 'item-b']);
  assert.deepEqual(orderItineraryEntries([b, move]).map((entry) => entry.key), ['item-b', 'item-c']);
  assert.equal(durationMinutes(a.day, '', details), 20);
  assert.equal(durationMinutes(a.day, '23:40', { ...details, endDay: '2026-11-22', endTime: '06:10' }), 390);
  assert.equal(durationMinutes(a.day, '23:40', { ...details, endDay: a.day, endTime: '06:10' }), undefined);
  assert.equal(itemDetails({ kind: '予定' }).category, 'other');
  assert.equal(itemDetails({ kind: '観光' }).category, 'sightseeing');
});
