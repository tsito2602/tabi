import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';
import { build } from 'esbuild';
const dir = await mkdtemp(join(tmpdir(), 'tabi-pwa-'));
await build({ entryPoints: ['worker/index.ts'], bundle: true, platform: 'node', format: 'cjs', outfile: join(dir, 'worker.cjs'), logLevel: 'silent' });
const worker = createRequire(import.meta.url)(join(dir, 'worker.cjs')).default;
after(() => rm(dir, { recursive: true, force: true }));
async function fixture() {
  const db = new DatabaseSync(':memory:'); db.exec('PRAGMA foreign_keys=ON');
  const schema = await readFile('worker/schema.sql', 'utf8'); db.exec(schema); db.exec(schema);
  for (const user of ['owner', 'editor', 'outsider']) {
    db.prepare('INSERT INTO users (id,email) VALUES (?,?)').run(user, `${user}@example.test`);
    db.prepare('INSERT INTO sessions (token_hash,user_id,expires_at,created_at) VALUES (?,?,unixepoch()+1000,unixepoch())').run(createHash('sha256').update(user).digest('hex'), user);
  }
  const DB = { prepare(sql) { return { args: [], bind(...args) { this.args = args; return this; }, async first() { return db.prepare(sql).get(...this.args) ?? null; }, async all() { return { results: db.prepare(sql).all(...this.args) }; }, async run() { return { meta: { changes: db.prepare(sql).run(...this.args).changes } }; } }; }, async batch(statements) { db.exec('BEGIN'); try { const results = await Promise.all(statements.map((statement) => statement.run())); db.exec('COMMIT'); return results; } catch (cause) { db.exec('ROLLBACK'); throw cause; } } };
  const removed = [];
  const env = { DB, BUCKET: { delete: async (keys) => removed.push(...keys) } };
  const call = (path, method = 'GET', body, user = 'owner') => worker.fetch(new Request(`https://example.test/v1${path}`, { method, headers: { authorization: `Bearer ${user}`, 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }), env);
  const trip = { id: randomUUID(), name: '旅', destination: 'Vienna', startsOn: '2026-11-21', endsOn: '2026-11-28', coverImage: 'data:image/jpeg;base64,/9j/AA==' };
  assert.equal((await call('/trips', 'POST', trip)).status, 201);
  db.prepare("INSERT INTO trip_members (trip_id,user_id,role) VALUES (?, 'editor', 'editor')").run(trip.id);
  return { db, call, trip, removed };
}
const place = { title: '美術館', note: '展示', openingHours: '10:00–18:00', reservationStatus: 'needed', location: 'https://maps.app.goo.gl/abc', status: 'want' };
test('places CRUD is shared, validated, scoped and replay-safe', async () => {
  const { db, call, trip } = await fixture();
  try {
    const base = `/trips/${trip.id}/places`, id = randomUUID();
    assert.equal((await call(base, 'POST', { id, ...place })).status, 201);
    assert.equal((await call(base, 'POST', { id, ...place })).status, 201);
    const items = (await (await call(base, 'GET', undefined, 'editor')).json()).places;
    assert.equal(items.length, 1); assert.equal(items[0].openingHours, place.openingHours);
    assert.equal((await call(`${base}/${id}`, 'PATCH', { ...place, status: 'visited', reservationStatus: 'confirmed' }, 'editor')).status, 200);
    assert.equal((await call(base, 'POST', { ...place, status: 'invalid' })).status, 400);
    assert.equal((await call(base, 'POST', { ...place, location: 'javascript:alert(1)' })).status, 400);
    assert.equal((await call(base, 'POST', { ...place, title: ' ' })).status, 400);
    assert.equal((await call(base, 'GET', undefined, 'outsider')).status, 403);
    assert.equal((await call(`${base}/${id}`, 'DELETE', undefined, 'outsider')).status, 403);
    assert.equal((await call(`${base}/${id}`, 'DELETE')).status, 204);
    assert.equal((await call(`${base}/${id}`, 'DELETE')).status, 204);
    assert.equal((await (await call(base)).json()).places.length, 0);
  } finally { db.close(); }
});
test('cover images survive older client updates and can be removed', async () => {
  const { db, call, trip } = await fixture();
  try {
    assert.equal((await (await call('/trips')).json()).trips[0].coverImage, trip.coverImage);
    const { coverImage, ...oldClient } = trip;
    assert.equal((await call(`/trips/${trip.id}`, 'PATCH', { ...oldClient, name: '更新' })).status, 200);
    assert.equal((await (await call('/trips')).json()).trips[0].coverImage, coverImage);
    assert.equal((await call(`/trips/${trip.id}`, 'PATCH', { ...trip, coverImage: 'https://untrusted.test/image' })).status, 400);
    assert.equal((await call(`/trips/${trip.id}`, 'PATCH', { ...trip, coverImage: '' })).status, 200);
    assert.equal((await (await call('/trips')).json()).trips[0].coverImage, '');
  } finally { db.close(); }
});
test('only owners delete trips and cascades remove children and R2 objects', async () => {
  const { db, call, trip, removed } = await fixture();
  try {
    await call(`/trips/${trip.id}/places`, 'POST', { ...place });
    const bookingId = randomUUID();
    db.prepare("INSERT INTO bookings (id,trip_id,kind,title,day,updated_by) VALUES (?,?,'ticket','Ticket','2026-11-21','owner')").run(bookingId, trip.id);
    db.prepare("INSERT INTO booking_documents (id,trip_id,booking_id,object_key,filename,content_type,size,uploaded_by) VALUES ('doc',?,?,?,'file.pdf','application/pdf',12,'owner')").run(trip.id, bookingId, `${trip.id}/file.pdf`);
    assert.equal((await call(`/trips/${trip.id}`, 'DELETE', undefined, 'editor')).status, 403);
    assert.equal(removed.length, 0);
    assert.equal((await call(`/trips/${trip.id}`, 'DELETE')).status, 204);
    assert.deepEqual(removed, [`${trip.id}/file.pdf`]);
    for (const table of ['trips','places','trip_covers','bookings','booking_documents','trip_members']) assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n, 0, table);
    assert.equal((await call(`/trips/${trip.id}`, 'DELETE')).status, 204);
  } finally { db.close(); }
});

test('members are scoped and only owners can change roles or remove people', async () => {
  const { db, call, trip } = await fixture();
  try {
    const base = `/trips/${trip.id}/members`;
    assert.equal((await call(base, 'GET', undefined, 'outsider')).status, 403);
    assert.equal((await (await call(base, 'GET', undefined, 'editor')).json()).members.length, 2);
    for (const actor of ['editor', 'outsider']) {
      assert.equal((await call(`${base}/editor`, 'PATCH', { role: 'viewer' }, actor)).status, 403);
      assert.equal((await call(`${base}/editor`, 'DELETE', undefined, actor)).status, 403);
      assert.equal((await call(`/trips/${trip.id}/invites`, 'POST', undefined, actor)).status, 403);
      assert.equal((await call(`/trips/${trip.id}/invites`, 'DELETE', undefined, actor)).status, 403);
    }
    assert.equal((await call(`${base}/owner`, 'DELETE')).status, 409);
    assert.equal((await call(`${base}/owner`, 'PATCH', { role: 'viewer' })).status, 409);
    assert.equal((await call(`${base}/editor`, 'PATCH', { role: 'owner' })).status, 400);
    assert.equal((await call(`${base}/outsider`, 'PATCH', { role: 'viewer' })).status, 404);
    assert.equal((await call(`${base}/editor`, 'PATCH', { role: 'viewer' })).status, 200);
    assert.equal((await (await call('/trips', 'GET', undefined, 'editor')).json()).trips[0].role, 'viewer');
    assert.equal((await call(`${base}/editor`, 'PATCH', { role: 'editor' })).status, 200);
    assert.equal((await (await call('/trips', 'GET', undefined, 'editor')).json()).trips[0].role, 'editor');
    assert.equal((await call(`${base}/editor`, 'DELETE')).status, 204);
    assert.equal((await call(`/trips/${trip.id}/places`, 'GET', undefined, 'editor')).status, 403);
    assert.equal((await (await call('/trips', 'GET', undefined, 'editor')).json()).trips.length, 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM trip_member_permissions').get().n, 0);
  } finally { db.close(); }
});

test('viewers can read every collection but cannot mutate trips, plans, documents or membership', async () => {
  const { db, call, trip } = await fixture();
  try {
    const base = `/trips/${trip.id}`;
    await call(`${base}/members/editor`, 'PATCH', { role: 'viewer' });
    for (const collection of ['items', 'bookings', 'packing', 'tasks', 'places', 'booking-documents', 'members']) {
      assert.equal((await call(`${base}/${collection}`, 'GET', undefined, 'editor')).status, 200, collection);
    }
    for (const [path, method] of [
      ['', 'PATCH'], ['', 'DELETE'], ['/items', 'POST'], ['/items/id', 'PATCH'], ['/items/id', 'DELETE'],
      ['/bookings', 'POST'], ['/bookings/id', 'PATCH'], ['/bookings/id', 'DELETE'], ['/bookings/id/connection', 'PATCH'],
      ['/bookings/id/documents', 'POST'], ['/bookings/id/documents/doc', 'DELETE'],
      ['/packing', 'POST'], ['/packing/id', 'PATCH'], ['/packing/id', 'DELETE'],
      ['/tasks', 'POST'], ['/tasks/id', 'PATCH'], ['/tasks/id', 'DELETE'],
      ['/places', 'POST'], ['/places/id', 'PATCH'], ['/places/id', 'DELETE'],
      ['/invites', 'POST'], ['/invites', 'DELETE'], ['/members/owner', 'PATCH'], ['/members/owner', 'DELETE'],
    ]) assert.equal((await call(base + path, method, { role: 'editor' }, 'editor')).status, 403, `${method} ${path}`);
    await call(`${base}/members/editor`, 'PATCH', { role: 'editor' });
    assert.equal((await call(`${base}/places`, 'POST', place, 'editor')).status, 201);
  } finally { db.close(); }
});

test('revoked links cannot be used and removing a member also revokes outstanding invites', async () => {
  const { db, call, trip } = await fixture();
  try {
    const base = `/trips/${trip.id}`;
    const token = async () => new URL((await (await call(`${base}/invites`, 'POST')).json()).invite.url).searchParams.get('invite');
    const first = await token();
    await call(`${base}/invites`, 'DELETE');
    assert.equal((await call(`/invites/${first}/accept`, 'POST', undefined, 'outsider')).status, 404);
    const second = await token();
    await call(`${base}/members/editor`, 'DELETE');
    assert.equal((await call(`/invites/${second}/accept`, 'POST', undefined, 'editor')).status, 404);
    const third = await token();
    assert.equal((await call(`/invites/${third}/accept`, 'POST', undefined, 'outsider')).status, 200);
    assert.equal((await call(`/invites/${third}/accept`, 'POST', undefined, 'editor')).status, 404);
    assert.equal((await (await call('/trips', 'GET', undefined, 'outsider')).json()).trips[0].role, 'editor');
  } finally { db.close(); }
});

test('profile edits are validated, account-scoped and visible to trip members', async () => {
  const { db, call, trip } = await fixture();
  try {
    db.prepare('INSERT INTO user_profiles(user_id, avatar_url) VALUES (?, ?)').run('owner', 'https://lh3.googleusercontent.com/example');
    assert.equal((await call('/me', 'PATCH', { name: '   ' })).status, 400);
    assert.equal((await call('/me', 'PATCH', { name: 'a'.repeat(101) })).status, 400);
    assert.equal((await call('/me', 'PATCH', { name: '  翼  ', id: 'editor', avatarUrl: 'https://untrusted.test/image' })).status, 200);
    const { user } = await (await call('/me')).json();
    assert.equal(user.name, '翼');
    assert.equal(user.avatarUrl, 'https://lh3.googleusercontent.com/example');
    assert.equal((await (await call('/me', 'GET', undefined, 'editor')).json()).user.name, null);
    const { members } = await (await call(`/trips/${trip.id}/members`, 'GET', undefined, 'editor')).json();
    assert.equal(members.find((member) => member.id === 'owner').name, '翼');
    assert.equal(members.find((member) => member.id === 'owner').avatarUrl, user.avatarUrl);
  } finally { db.close(); }
});

test('task assignments use current trip members and preserve existing legacy assignments', async () => {
  const { db, call, trip } = await fixture();
  try {
    const base = `/trips/${trip.id}/tasks`;
    const task = { id: randomUUID(), title: '準備', dueOn: '', assignee: 'member:editor', done: false };
    assert.equal((await call(base, 'POST', task)).status, 201);
    assert.equal((await call(base, 'POST', task)).status, 201);
    await call('/me', 'PATCH', { name: '同行者の新しい名前' }, 'editor');
    assert.equal((await (await call(base)).json()).tasks[0].assignee, 'member:editor');
    assert.equal((await call(base, 'POST', { ...task, id: randomUUID(), assignee: 'member:outsider' })).status, 400);
    assert.equal((await call(base, 'POST', { ...task, id: randomUUID(), assignee: '手入力' })).status, 400);
    assert.equal((await call(`${base}/${task.id}`, 'PATCH', task, 'outsider')).status, 403);
    db.prepare('UPDATE travel_tasks SET assignee = ? WHERE id = ?').run('既存の名前', task.id);
    assert.equal((await call(`${base}/${task.id}`, 'PATCH', { ...task, assignee: '既存の名前', done: true })).status, 200);
    assert.equal((await call(`${base}/${task.id}`, 'PATCH', { ...task, assignee: '' })).status, 200);
    assert.equal((await call(`${base}/${task.id}`, 'PATCH', task)).status, 200);
    db.prepare('DELETE FROM trip_members WHERE trip_id = ? AND user_id = ?').run(trip.id, 'editor');
    assert.equal((await call(`${base}/${task.id}`, 'PATCH', { ...task, done: true })).status, 200);
    assert.equal((await call(base, 'POST', { ...task, id: randomUUID() })).status, 400);
  } finally { db.close(); }
});

test('booking map locations preserve legacy addresses and round-trip URLs safely', async () => {
  const { db, call, trip } = await fixture();
  try {
    const base = `/trips/${trip.id}/bookings`;
    const input = { id: randomUUID(), kind: 'hotel', title: 'Hotel Astoria', detail: 'Kärntner Straße 32, Wien', day: '2026-11-22', endDay: '2026-11-24', time: '15:00', endTime: '11:00' };
    assert.equal((await call(base, 'POST', input)).status, 201);
    const read = async () => (await (await call(base)).json()).bookings.find((booking) => booking.id === input.id);
    assert.equal((await read()).location, input.detail);
    const location = `https://www.google.com/maps/place/${'a'.repeat(700)}`;
    assert.equal((await call(`${base}/${input.id}`, 'PATCH', { ...input, detail: location, location })).status, 200);
    assert.equal((await read()).location, location);
    // A queued write from an older client must not clear the newly saved URL.
    assert.equal((await call(`${base}/${input.id}`, 'PATCH', input)).status, 200);
    assert.equal((await read()).location, location);
    for (const location of ['javascript:alert(1)', 'https://', 'a'.repeat(2001)]) {
      assert.equal((await call(`${base}/${input.id}`, 'PATCH', { ...input, location })).status, 400);
    }
    assert.equal((await call(`${base}/${input.id}`, 'PATCH', { ...input, location: 'Tokyo' }, 'outsider')).status, 403);
    assert.equal((await read()).location, location);
    assert.equal((await call(`${base}/${input.id}`, 'PATCH', { ...input, location: '' })).status, 200);
    assert.equal((await read()).location, '');
    const restaurant = { ...input, id: randomUUID(), kind: 'restaurant', detail: '2名・テーブル席', location: 'https://maps.app.goo.gl/example' };
    assert.equal((await call(base, 'POST', restaurant)).status, 201);
    assert.equal((await call(base, 'POST', restaurant)).status, 201);
    const dining = (await (await call(base)).json()).bookings.find((booking) => booking.id === restaurant.id);
    assert.equal(dining.location, restaurant.location);
    assert.equal(dining.detail, restaurant.detail);
    assert.equal((await call(`${base}/${input.id}`, 'DELETE')).status, 204);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM booking_locations WHERE booking_id = ?').get(input.id).n, 0);
  } finally { db.close(); }
});
