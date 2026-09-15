import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import ts from 'typescript';

const modules = new Map();
function load(path) {
  path = resolve(path);
  if (modules.has(path)) return modules.get(path).exports;
  const module = { exports: {} };
  modules.set(path, module);
  const code = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'module', 'exports', code)((name) => {
    if (!name.startsWith('.')) throw new Error(`Unexpected dependency ${name}`);
    return load(resolve(dirname(path), `${name}.ts`));
  }, module, module.exports);
  return module.exports;
}
const { itineraryTimeline, bookingTimelineEntries } = load('src/data/itinerary-timeline.ts');
const { placePlanError, placePlanInput, createPlacePlanCommitter } = load('src/data/place-plan.ts');
const { queueItineraryArrival, hasItineraryArrival, takeItineraryArrival, cancelItineraryArrival, itineraryItemOffset } = load('src/utils/itinerary-arrival.ts');
const trip = { id: 'trip', name: '旅', destination: '', startsOn: '2026-11-22', endsOn: '2026-11-25', role: 'owner', memberCount: 2 };
const place = { id: 'place', title: '美術館', note: '展示メモ', openingHours: '10–18', location: '地図', referenceLinks: [{ label: '公式', url: 'https://example.com/' }], reservationStatus: 'confirmed', status: 'want' };
const plan = { day: '2026-11-23', time: '12:00', category: 'sightseeing' };
const item = (id, time, day = plan.day, details) => ({ id, time, day, title: id, kind: '予定', note: '', ...(details ? { details } : {}) });
const booking = (kind, overrides = {}) => ({ id: kind, kind, title: kind, detail: '', origin: '', destination: '', originCode: '', destinationCode: '', day: plan.day, time: '10:00', endDay: plan.day, endTime: '11:00', confirmationCode: '', note: '', ...overrides });
const context = (overrides = {}) => ({ trip, expectedTripId: trip.id, place, items: [], canEdit: true, ...overrides });

for (const kind of ['flight', 'hotel', 'train', 'car', 'restaurant', 'ticket', 'other']) {
  test(`${kind}: preview shares actual itinerary endpoints across midnight`, () => {
    const b = booking(kind, { day: '2026-11-22', time: '23:30', endDay: plan.day, endTime: '01:00' });
    const entries = itineraryTimeline([], [b], []);
    assert.equal(entries.length, 2);
    assert.deepEqual(entries.map(e => [e.day, e.time, e.bookingEndpoint]), [['2026-11-22', '23:30', 'start'], [plan.day, '01:00', 'end']]);
    assert.deepEqual(bookingTimelineEntries({ ...b, endDay: b.day, endTime: b.time }).map(e => e.bookingEndpoint), ['start']);
    assert.equal(bookingTimelineEntries({ ...b, endTime: '' }).length, 1);
  });
}

test('candidate appears between real plans; untimed items follow timed entries without mutating input', () => {
  const items = [item('late', '18:00'), item('early', '09:00'), item('untimed', '')];
  const snapshot = structuredClone(items);
  const draft = { id: 'candidate', ...placePlanInput(place, plan) };
  const timeline = itineraryTimeline([...items, draft], [], []);
  assert.deepEqual(timeline.map(e => e.item.id), ['early', 'candidate', 'late', 'untimed']);
  assert.deepEqual(items, snapshot);
  assert.equal(itineraryTimeline([draft], [], []).length, 1);
  const linkedPlace = { ...place, title: '最新の場所名', itineraryItemId: draft.id };
  assert.equal(itineraryTimeline([draft], [], [linkedPlace])[0].title, linkedPlace.title);
});

test('anchored transfers remain beside their preceding plan and detached transfers fall back safely', () => {
  const transfer = item('walk', '', plan.day, { category: 'transport', location: '', endDay: '', endTime: '', transport: { mode: 'walk', origin: '', destination: '', afterKey: 'item-early' } });
  const before = item('early', '09:00'), after = item('after', '10:00');
  assert.deepEqual(itineraryTimeline([before, transfer, after], [], []).map(e => e.item.id), ['early', 'walk', 'after']);
  assert.deepEqual(itineraryTimeline([transfer, after], [], []).map(e => e.item.id), ['after', 'walk']);
});

test('invalid dates, clocks, deleted places, changed trips and revoked edits are rejected before mutation', () => {
  for (const day of ['', '2026-02-29', '2026-13-01', '2026-2-01']) assert(placePlanError(place, trip, trip.id, { ...plan, day }, true));
  for (const time of ['24:00', '9:00', '10:60']) assert(placePlanError(place, trip, trip.id, { ...plan, time }, true));
  for (const time of ['', '00:00', '23:59']) assert.equal(placePlanError(place, trip, trip.id, { ...plan, time }, true), '');
  assert.equal(placePlanError(place, trip, trip.id, { ...plan, day: '2028-02-29' }, true), '', 'outside-trip valid dates are allowed with a UI warning');
  for (const ctx of [context({ place: undefined }), context({ trip: null }), context({ expectedTripId: 'other' }), context({ canEdit: false })]) {
    const saver = createPlacePlanCommitter();
    assert.throws(() => saver.save(ctx, plan, { createItem: () => assert.fail('must not create'), updatePlace: () => assert.fail('must not update') }));
  }
  assert(placePlanError(place, trip, trip.id, { ...plan, category: 'transport' }, true));
});

for (const status of ['want', 'planned', 'visited', 'skipped']) {
  test(`${status}: local-first save preserves the source and repeated taps create only one item`, () => {
    const source = { ...structuredClone(place), status }, snapshot = structuredClone(source);
    const calls = [];
    const actions = {
      createItem: (input) => { calls.push(['create', input]); return 'new-item'; },
      updatePlace: (id, input) => calls.push(['link', id, input]),
    };
    const saver = createPlacePlanCommitter(), ctx = context({ place: source });
    assert.deepEqual(calls, [], 'opening/previewing never writes');
    assert.deepEqual(saver.save(ctx, plan, actions), { itemId: 'new-item', inserted: true });
    saver.save(ctx, plan, actions);
    assert.equal(calls.length, 2);
    assert.deepEqual(source, snapshot);
    assert.deepEqual(calls[1][2], { ...snapshot, itineraryItemId: 'new-item', status: status === 'visited' ? 'visited' : 'planned' });
    assert.equal(calls[0][1].note, '', 'place notes remain in their original source');
    assert.equal(calls[0][1].time, plan.time);
  });
}

test('a live existing link navigates without creating, including viewers and changed source snapshots', () => {
  const source = { ...place, itineraryItemId: 'already' };
  const result = createPlacePlanCommitter().save(context({ place: source, items: [item('already', '')], canEdit: false }), plan,
    { createItem: () => assert.fail(), updatePlace: () => assert.fail() });
  assert.deepEqual(result, { itemId: 'already', inserted: false });
});

test('failed link can be retried without duplicate items or silently changing their saved date', () => {
  let creations = 0, links = 0;
  const actions = { createItem: () => { creations++; return 'retry-item'; }, updatePlace: () => { if (++links === 1) throw new Error('link failed'); } };
  const saver = createPlacePlanCommitter();
  assert.throws(() => saver.save(context(), plan, actions), /link failed/);
  assert.equal(saver.pendingItemId, 'retry-item');
  assert.throws(() => saver.save(context(), { ...plan, time: '14:00' }, actions), /日時/);
  assert.deepEqual(saver.save(context(), plan, actions), { itemId: 'retry-item', inserted: true });
  assert.equal(creations, 1); assert.equal(links, 2);
});

test('creation failure remains retryable and a deleted old link permits one new item', () => {
  let calls = 0;
  const actions = { createItem: () => { if (++calls === 1) throw new Error('failed'); return 'new'; }, updatePlace: () => {} };
  const saver = createPlacePlanCommitter(), ctx = context({ place: { ...place, itineraryItemId: 'deleted' } });
  assert.throws(() => saver.save(ctx, plan, actions));
  assert.equal(saver.pendingItemId, undefined);
  assert.equal(saver.save(ctx, plan, actions).itemId, 'new');
});

test('arrival is trip-scoped, one-use, expires, and cannot be replayed by a URL alone', () => {
  const token = queueItineraryArrival('trip', 'item', 1000);
  assert.equal(hasItineraryArrival('trip', 'item', token, 1001), true);
  assert.equal(takeItineraryArrival('other', 'item', token, 1001), false);
  assert.equal(takeItineraryArrival('trip', 'other', token, 1001), false);
  assert.equal(takeItineraryArrival('trip', 'item', 'forged', 1001), false);
  assert.equal(takeItineraryArrival('trip', 'item', token, 1001), true);
  assert.equal(takeItineraryArrival('trip', 'item', token, 1002), false);
  const expired = queueItineraryArrival('trip', 'item', 1000);
  assert.equal(takeItineraryArrival('trip', 'item', expired, 31000), false);
  const old = queueItineraryArrival('trip', 'item', 40000);
  const current = queueItineraryArrival('trip', 'new', 40001);
  cancelItineraryArrival(old);
  assert.equal(hasItineraryArrival('trip', 'new', current, 40002), true);
  cancelItineraryArrival(current);
  assert.equal(hasItineraryArrival('trip', 'new', current, 40002), false);
});

test('scroll waits for measured row geometry and accounts for variable date headers', () => {
  assert.equal(itineraryItemOffset(300, 16, 1000, 44, 520, 62), 1808);
  assert.equal(itineraryItemOffset(300, 16, 1000, 88, 520, 62), 1852);
  assert.equal(itineraryItemOffset(0, 0, 0, 0, 0, 62), 0);
  for (let index = 0; index < 5; index++) {
    const values = [300, 16, 1000, 44, 520]; values[index] = undefined;
    assert.equal(itineraryItemOffset(...values, 62), undefined);
    values[index] = Number.NaN;
    assert.equal(itineraryItemOffset(...values, 62), undefined);
  }
});
