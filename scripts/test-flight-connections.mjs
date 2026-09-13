import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';
import { build } from 'esbuild';

const dir = await mkdtemp(join(tmpdir(), 'tabi-connections-'));
const require = createRequire(import.meta.url);
for (const [name, entry] of [['connections', 'src/data/flight-connections.ts'], ['worker', 'worker/index.ts'], ['duration', 'src/data/booking-duration.ts']]) {
  await build({ entryPoints: [entry], bundle: true, platform: 'node', format: 'cjs', outfile: join(dir, `${name}.cjs`), logLevel: 'silent' });
}
const { findFlightConnections, connectionBetween, flightConnectionCandidates, hasLikelyFlightConnection } = require(join(dir, 'connections.cjs'));
const worker = require(join(dir, 'worker.cjs')).default;
const { bookingDuration, bookingDurationLabel } = require(join(dir, 'duration.cjs'));
after(() => rm(dir, { recursive: true, force: true }));
const flight = (id, extra = {}) => ({ id, kind: 'flight', title: id, origin: '', destination: '', detail: '', confirmationCode: '', note: '', originCode: 'NRT', destinationCode: 'DXB', day: '2026-11-21', time: '22:20', endDay: '2026-11-22', endTime: '05:30', ...extra });
const first = flight(randomUUID());
const second = flight(randomUUID(), { originCode: 'DXB', destinationCode: 'VIE', day: '2026-11-22', time: '08:55', endTime: '12:25' });
const later = flight(randomUUID(), { ...second, id: randomUUID(), time: '10:55', endTime: '14:25' });

test('overnight NRT-DXB-VIE retains the 3h25 connection in either input order', () => {
  for (const bookings of [[first, second], [second, first]]) {
    const [connection] = findFlightConnections(bookings);
    assert.equal(connection.durationMinutes, 205);
    assert.equal(connection.arrivalBookingId, first.id);
    assert.equal(connection.mode, 'auto');
  }
});

test('manual choice takes priority; none, removed targets and invalid targets never auto-reassign', () => {
  const input = [first, second, later];
  assert.equal(findFlightConnections([{ ...first, connectionMode: 'manual', nextFlightId: later.id }, second, later])[0].departureBookingId, later.id);
  for (const fields of [{ connectionMode: 'none' }, { connectionMode: 'manual', nextFlightId: null }, { connectionMode: 'manual', nextFlightId: 'deleted' }]) {
    assert.equal(findFlightConnections([{ ...first, ...fields }, ...input.slice(1)]).length, 0);
  }
  const invalid = { ...second, originCode: 'HND' };
  assert.equal(findFlightConnections([{ ...first, connectionMode: 'manual', nextFlightId: second.id }, invalid, later]).length, 0);
});

test('candidate dates, airport match, conflicts and long layovers are explicit', () => {
  const tomorrow = { ...second, id: randomUUID(), day: '2026-11-23', endDay: '2026-11-23' };
  const other = { ...first, id: randomUUID(), connectionMode: 'manual', nextFlightId: second.id };
  const candidates = flightConnectionCandidates(first, [first, later, second, tomorrow, other]);
  assert.equal(candidates[0].booking.id, second.id);
  assert.equal(candidates[0].assigned.id, other.id);
  assert.equal(connectionBetween(first, tomorrow).durationMinutes, 1645);
  assert.equal(findFlightConnections([first, tomorrow]).length, 0);
  assert.equal(findFlightConnections([{ ...first, connectionMode: 'manual', nextFlightId: tomorrow.id }, tomorrow]).length, 1);
  for (const invalid of [{ ...second, originCode: 'HND' }, { ...second, time: '05:00' }, { ...second, day: '2026-02-30' }, { ...second, time: '' }, first]) assert.equal(connectionBetween(first, invalid), null);
});

test('a DST change at the same airport uses elapsed time', () => {
  const arrival = { ...first, destinationCode: 'VIE', endDay: '2026-10-25', endTime: '01:30' };
  const departure = { ...second, originCode: 'VIE', day: '2026-10-25', time: '03:30' };
  assert.equal(connectionBetween(arrival, departure).durationMinutes, 180);
});

test('connection control excludes absent, distant, incompatible and already assigned flights', () => {
  assert.equal(hasLikelyFlightConnection(first, [first]), false);
  assert.equal(hasLikelyFlightConnection(first, [first, second]), true);
  assert.equal(hasLikelyFlightConnection({ ...first, connectionMode: 'none' }, [first, second]), true);
  for (const changes of [{ day: '2026-11-27' }, { originCode: 'HND' }, { time: '05:45' }]) {
    assert.equal(hasLikelyFlightConnection(first, [first, { ...second, ...changes }]), false);
  }
  const assigned = { ...first, id: randomUUID(), connectionMode: 'manual', nextFlightId: second.id };
  assert.equal(hasLikelyFlightConnection(first, [first, second, assigned]), false);
  assert.equal(hasLikelyFlightConnection(second, [first, second]), false);
});

async function fixture() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON');
  const schema = await readFile('worker/schema.sql', 'utf8'); db.exec(schema); db.exec(schema);
  for (const user of ['owner', 'editor', 'outsider']) {
    db.prepare('INSERT INTO users (id,email) VALUES (?,?)').run(user, `${user}@example.test`);
    db.prepare('INSERT INTO sessions (token_hash,user_id,expires_at,created_at) VALUES (?,?,unixepoch()+1000,unixepoch())').run(createHash('sha256').update(user).digest('hex'), user);
  }
  db.exec("INSERT INTO trips (id,name,starts_on,ends_on,created_by) VALUES ('trip1','Test','2026-11-21','2026-11-28','owner'),('trip2','Test 2','2026-11-21','2026-11-28','owner'); INSERT INTO trip_members (trip_id,user_id,role) VALUES ('trip1','owner','owner'),('trip1','editor','editor'),('trip2','owner','owner');");
  const DB = { prepare(sql) { return { args: [], bind(...args) { this.args = args; return this; }, async first() { return db.prepare(sql).get(...this.args) ?? null; }, async all() { return { results: db.prepare(sql).all(...this.args) }; }, async run() { return { meta: { changes: db.prepare(sql).run(...this.args).changes } }; } }; }, async batch(statements) { db.exec('BEGIN'); try { const results = await Promise.all(statements.map((statement) => statement.run())); db.exec('COMMIT'); return results; } catch (cause) { db.exec('ROLLBACK'); throw cause; } } };
  const env = { DB, BUCKET: { delete: async () => {} } };
  const call = (path, body, { user = 'owner', trip = 'trip1', method = body ? 'PATCH' : 'GET' } = {}) => worker.fetch(new Request(`https://example.test/v1/trips/${trip}/bookings${path}`, { method, headers: { authorization: `Bearer ${user}`, 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }), env);
  for (const booking of [first, second, later]) assert.equal((await call('', booking, { method: 'POST' })).status, 201);
  return { db, call };
}

test('real API persists choices for both members, rejects cross-trip links and conflicting manual links', async () => {
  const { db, call } = await fixture();
  try {
    const path = `/${first.id}/connection`;
    assert.equal((await call(path, { mode: 'manual', nextFlightId: later.id })).status, 200);
    let bookings = (await (await call('', null, { user: 'editor' })).json()).bookings;
    assert.equal(findFlightConnections(bookings)[0].departureBookingId, later.id);
    assert.equal((await call(path, { mode: 'none' }, { user: 'outsider' })).status, 403);
    const foreign = { ...second, id: randomUUID() };
    await call('', foreign, { method: 'POST', trip: 'trip2' });
    assert.equal((await call(path, { mode: 'manual', nextFlightId: foreign.id })).status, 400);
    const competitor = { ...first, id: randomUUID() }; await call('', competitor, { method: 'POST' });
    assert.equal((await call(`/${competitor.id}/connection`, { mode: 'manual', nextFlightId: later.id })).status, 409);
    assert.equal((await call(path, { mode: 'manual', nextFlightId: first.id })).status, 400);
    assert.equal((await call(path, { mode: 'bogus' })).status, 400);
    await call(path, { mode: 'none' });
    bookings = (await (await call('')).json()).bookings;
    assert.ok(!findFlightConnections(bookings).some((c) => c.arrivalBookingId === first.id));
    await call(path, { mode: 'auto' });
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM flight_connection_preferences WHERE arrival_booking_id=?').get(first.id).count, 0);
  } finally { db.close(); }
});

test('deleting the chosen departure preserves manual mode and does not switch to another flight', async () => {
  const { db, call } = await fixture();
  try {
    await call(`/${first.id}/connection`, { mode: 'manual', nextFlightId: second.id });
    assert.equal((await call(`/${second.id}`, null, { method: 'DELETE' })).status, 204);
    const bookings = (await (await call('')).json()).bookings;
    const arrival = bookings.find((booking) => booking.id === first.id);
    assert.equal(arrival.connectionMode, 'manual'); assert.equal(arrival.nextFlightId, null);
    assert.equal(findFlightConnections(bookings).length, 0);
  } finally { db.close(); }
});

test('cycles cannot be constructed even from malformed flight timestamps', () => {
  const a = { ...first, originCode: 'DXB', destinationCode: 'DXB', day: '2026-11-22', time: '09:00', endTime: '05:00', connectionMode: 'manual', nextFlightId: second.id };
  const b = { ...second, originCode: 'DXB', destinationCode: 'DXB', time: '08:00', endTime: '06:00', connectionMode: 'manual', nextFlightId: first.id };
  assert.equal(findFlightConnections([a, b]).length, 1);
});


test('flight times exclude layovers and use airport offsets, summer time and calendar dates', () => {
  assert.equal(bookingDuration(first).minutes, 730);
  assert.equal(bookingDuration(second).minutes, 390);
  assert.equal(bookingDurationLabel(first), '飛行時間 12時間10分');
  assert.equal(bookingDuration({ ...second, day: '2026-07-22', endDay: '2026-07-22' }).minutes, 330);
  assert.equal(bookingDuration(flight('west', { day: '2026-11-22', time: '00:30', endDay: '2026-11-21', endTime: '17:30', destinationCode: 'LAX' })).minutes, 600);
  const spring = flight('spring', { originCode: 'JFK', destinationCode: 'LAX', day: '2026-03-08', time: '01:30', endDay: '2026-03-08', endTime: '04:30' });
  assert.equal(bookingDuration(spring).minutes, 300);
  assert.equal(bookingDuration({ ...spring, time: '02:30' }), null);
  for (const extra of [{ originCode: 'ZZZ' }, { destinationCode: '' }, { time: '' }, { endTime: '25:00' }, { endDay: '2026-02-30' }, { endDay: first.day, endTime: '01:00' }]) assert.equal(bookingDuration({ ...first, ...extra }), null);
});
test('train times support overnight travel and explicit ticket durations for time-zone crossings', () => {
  const train = { ...first, kind: 'train', time: '23:30', endTime: '06:15' };
  assert.equal(bookingDuration(train).minutes, 405);
  assert.equal(bookingDurationLabel(train), '乗車時間 6時間45分（時差なし）');
  const ticketTime = { ...train, durationMinutes: 345 };
  assert.deepEqual(bookingDuration(ticketTime), { minutes: 345, source: 'manual' });
  assert.equal(bookingDurationLabel(ticketTime), '乗車時間 5時間45分');
  assert.equal(bookingDuration({ ...ticketTime, durationMinutes: null }).minutes, 405);
  assert.equal(bookingDuration({ ...first, originCode: 'ZZZ', durationMinutes: 120 }).minutes, 120);
  for (const durationMinutes of [0, -1, 1.5, 10081]) assert.equal(bookingDuration({ ...first, durationMinutes }), null);
  for (const kind of ['hotel', 'car', 'restaurant', 'ticket', 'other']) assert.equal(bookingDuration({ ...first, kind }), null);
});
