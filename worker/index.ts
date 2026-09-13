/// <reference types="@cloudflare/workers-types" />
import { validDate } from '../src/utils/dates';
import { itineraryCategories, transportModes, itineraryDetailsError } from '../src/data/itinerary';
import type { ItineraryDetails } from '../src/data/types';
import { mapUrl, referenceUrl } from '../src/data/places';

import { createRemoteJWKSet, jwtVerify } from 'jose';
import { connectionBetween, createsFlightConnectionCycle, type FlightConnectionInput } from '../src/data/flight-connections';

type Env = {
  DB: D1Database;
  BUCKET: R2Bucket;
  ASSETS: Fetcher;
  GOOGLE_CLIENT_IDS: string;
  ALLOWED_ORIGINS?: string;
};

type User = { id: string; email: string; name: string | null; avatarUrl: string | null };
const googleJwks = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
const encoder = new TextEncoder();

function json(value: unknown, status = 200, headers?: HeadersInit) {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...headers } });
}

function cors(request: Request, env: Env) {
  const origin = request.headers.get('origin');
  const allowed = env.ALLOWED_ORIGINS?.split(',').map((value) => value.trim()) ?? [];
  const headers = new Headers({ 'access-control-allow-headers': 'authorization, content-type, x-filename, x-file-size', 'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS' });
  if (origin && allowed.includes(origin)) headers.set('access-control-allow-origin', origin);
  return headers;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function textField(value: unknown, maxLength: number, required = false) {
  if (typeof value !== 'string') return required ? null : '';
  const result = value.trim();
  if ((required && !result) || result.length > maxLength) return null;
  return result;
}

function dateField(value: unknown) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function idField(value: unknown) {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null;
}

async function memberRole(env: Env, tripId: string, userId: string) {
  const row = await env.DB.prepare(`SELECT CASE WHEN tm.role = 'owner' THEN 'owner' WHEN p.read_only = 1 THEN 'viewer' ELSE tm.role END AS role FROM trip_members tm LEFT JOIN trip_member_permissions p ON p.trip_id = tm.trip_id AND p.user_id = tm.user_id WHERE tm.trip_id = ? AND tm.user_id = ?`)
    .bind(tripId, userId)
    .first<{ role: 'owner' | 'editor' | 'viewer' }>();
  return row?.role ?? null;
}

async function requireMember(env: Env, tripId: string, userId: string) {
  return (await memberRole(env, tripId, userId)) ? null : json({ error: 'この旅行を編集する権限がありません' }, 403);
}

async function hashToken(token: string) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(token));
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

async function currentUser(request: Request, env: Env): Promise<User | null> {
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) return null;
  const tokenHash = await hashToken(authorization.slice(7));
  return env.DB.prepare(`SELECT u.id, u.email, u.display_name AS name, p.avatar_url AS avatarUrl FROM sessions s JOIN users u ON u.id = s.user_id LEFT JOIN user_profiles p ON p.user_id = u.id WHERE s.token_hash = ? AND s.expires_at > unixepoch()`)
    .bind(tokenHash)
    .first<User>();
}

async function googleLogin(request: Request, env: Env) {
  const body = (await request.json().catch(() => null)) as { idToken?: string } | null;
  if (!body?.idToken) return json({ error: 'IDトークンが必要です' }, 400);
  const audiences = env.GOOGLE_CLIENT_IDS.split(',').map((value) => value.trim()).filter(Boolean);
  if (!audiences.length) return json({ error: 'OAuth設定が完了していません' }, 503);
  try {
    const { payload } = await jwtVerify(body.idToken, googleJwks, {
      issuer: ['https://accounts.google.com', 'accounts.google.com'],
      audience: audiences,
    });
    if (!payload.sub || !payload.email || payload.email_verified !== true) return json({ error: '確認済みGoogleアカウントが必要です' }, 401);
    const user: User = { id: payload.sub, email: String(payload.email).toLowerCase(), name: typeof payload.name === 'string' ? payload.name : null, avatarUrl: typeof payload.picture === 'string' && /^https:\/\//.test(payload.picture) ? payload.picture : null };
    await env.DB.prepare(`INSERT INTO users (id, email, display_name, updated_at) VALUES (?, ?, ?, unixepoch()) ON CONFLICT(id) DO UPDATE SET email = excluded.email, display_name = COALESCE(users.display_name, excluded.display_name), updated_at = unixepoch()`)
      .bind(user.id, user.email, user.name)
      .run();
    await env.DB.prepare(`INSERT INTO user_profiles (user_id, avatar_url) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET avatar_url = excluded.avatar_url`).bind(user.id, user.avatarUrl).run();
    const saved = await env.DB.prepare('SELECT display_name AS name FROM users WHERE id = ?').bind(user.id).first<{ name: string | null }>();
    user.name = saved?.name ?? user.name;
    const token = randomToken();
    await env.DB.prepare(`INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, unixepoch() + 2592000, unixepoch())`)
      .bind(await hashToken(token), user.id)
      .run();
    return json({ token, user });
  } catch {
    return json({ error: 'Googleログインを確認できませんでした' }, 401);
  }
}

async function listTrips(env: Env, user: User) {
  const result = await env.DB.prepare(`
    SELECT t.id, t.name, t.destination, t.starts_on AS startsOn, t.ends_on AS endsOn,
           t.updated_at AS updatedAt, CASE WHEN tm.role = 'owner' THEN 'owner' WHEN mp.read_only = 1 THEN 'viewer' ELSE tm.role END AS role, COALESCE(tc.image, '') AS coverImage,
           (SELECT COUNT(*) FROM trip_members members WHERE members.trip_id = t.id) AS memberCount
    FROM trips t
    LEFT JOIN trip_covers tc ON tc.trip_id = t.id
    JOIN trip_members tm ON tm.trip_id = t.id
    LEFT JOIN trip_member_permissions mp ON mp.trip_id = tm.trip_id AND mp.user_id = tm.user_id
    WHERE tm.user_id = ?
    ORDER BY t.starts_on, t.id
  `).bind(user.id).all();
  return json({ trips: result.results });
}

async function createTrip(request: Request, env: Env, user: User) {
  const body = await request.json().catch(() => null);
  if (!isObject(body)) return json({ error: '旅行データが必要です' }, 400);
  const name = textField(body.name, 120, true);
  const destination = textField(body.destination, 160);
  const startsOn = dateField(body.startsOn);
  const endsOn = dateField(body.endsOn);
  const coverImage = body.coverImage === undefined ? undefined : textField(body.coverImage, 550000);
  if (coverImage === null || (coverImage && !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(coverImage))) return json({ error: 'トップ画像を選び直してください' }, 400);
  if (!name || destination === null || !startsOn || !endsOn || startsOn > endsOn) {
    return json({ error: '旅行名と正しい日付を入力してください' }, 400);
  }
  const id = idField(body.id) ?? crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO trips (id, name, destination, starts_on, ends_on, created_by)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        destination = excluded.destination,
        starts_on = excluded.starts_on,
        ends_on = excluded.ends_on,
        updated_at = unixepoch()
      WHERE trips.created_by = excluded.created_by
    `)
      .bind(id, name, destination, startsOn, endsOn, user.id),
    env.DB.prepare("INSERT INTO trip_members (trip_id, user_id, role) SELECT id, ?, 'owner' FROM trips WHERE id = ? AND created_by = ? ON CONFLICT(trip_id, user_id) DO NOTHING")
      .bind(user.id, id, user.id),
  ]);
  if (!(await memberRole(env, id, user.id))) return json({ error: '旅行IDが競合しました' }, 409);
  if (coverImage !== undefined) await env.DB.prepare('INSERT INTO trip_covers (trip_id, image) VALUES (?, ?) ON CONFLICT(trip_id) DO UPDATE SET image = excluded.image').bind(id, coverImage).run();
  return json({ trip: { id, name, destination, startsOn, endsOn, coverImage, role: 'owner', memberCount: 1 } }, 201);
}

async function updateTrip(request: Request, env: Env, user: User, tripId: string) {
  const forbidden = await requireMember(env, tripId, user.id);
  if (forbidden) return forbidden;
  const body = await request.json().catch(() => null);
  if (!isObject(body)) return json({ error: '旅行データが必要です' }, 400);
  const name = textField(body.name, 120, true);
  const destination = textField(body.destination, 160);
  const startsOn = dateField(body.startsOn);
  const endsOn = dateField(body.endsOn);
  const coverImage = body.coverImage === undefined ? undefined : textField(body.coverImage, 550000);
  if (coverImage === null || (coverImage && !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(coverImage))) return json({ error: 'トップ画像を選び直してください' }, 400);
  if (!name || destination === null || !startsOn || !endsOn || startsOn > endsOn) {
    return json({ error: '旅行名と正しい日付を入力してください' }, 400);
  }
  const results = await env.DB.batch([
    env.DB.prepare(`UPDATE trips SET name = ?, destination = ?, starts_on = ?, ends_on = ?, updated_at = unixepoch() WHERE id = ?`).bind(name, destination, startsOn, endsOn, tripId),
    ...(coverImage === undefined ? [] : [env.DB.prepare('INSERT INTO trip_covers (trip_id, image) VALUES (?, ?) ON CONFLICT(trip_id) DO UPDATE SET image = excluded.image').bind(tripId, coverImage)]),
  ]);
  return results[0].meta.changes ? json({ trip: { id: tripId, name, destination, startsOn, endsOn, coverImage } }) : json({ error: '旅行が見つかりません' }, 404);
}

async function deleteTrip(env: Env, user: User, tripId: string) {
  const role = await memberRole(env, tripId, user.id);
  if (!role) {
    const exists = await env.DB.prepare('SELECT id FROM trips WHERE id = ?').bind(tripId).first();
    return exists ? json({ error: '旅行を削除する権限がありません' }, 403) : new Response(null, { status: 204 });
  }
  if (role !== 'owner') return json({ error: '旅行を削除できるのは作成者だけです' }, 403);
  const objects = await env.DB.prepare('SELECT object_key FROM booking_documents WHERE trip_id = ? UNION SELECT object_key FROM attachments WHERE trip_id = ?').bind(tripId, tripId).all<{ object_key: string }>();
  // Keep the database records if object cleanup fails; a retry can safely finish.
  for (let i = 0; i < objects.results.length; i += 1000) await env.BUCKET.delete(objects.results.slice(i, i + 1000).map((entry) => entry.object_key));
  await env.DB.prepare('DELETE FROM trips WHERE id = ?').bind(tripId).run();
  return new Response(null, { status: 204 });
}

function placeFields(body: Record<string, unknown>) {
  const title = textField(body.title, 160, true);
  const note = textField(body.note, 4000);
  const openingHours = textField(body.openingHours, 500);
  const location = textField(body.location, 2000);
  let referenceLinks: { label: string; url: string }[] | undefined;
  if (body.referenceLinks !== undefined) {
    if (!Array.isArray(body.referenceLinks) || body.referenceLinks.length > 20) return null;
    referenceLinks = [];
    for (const link of body.referenceLinks) {
      if (!isObject(link)) return null;
      const label = textField(link.label, 120);
      const url = textField(link.url, 2000, true);
      if (label === null || !url || !referenceUrl(url)) return null;
      referenceLinks.push({ label, url });
    }
  }
  const itineraryItemId = body.itineraryItemId == null ? body.itineraryItemId : idField(body.itineraryItemId);
  if (body.itineraryItemId != null && !itineraryItemId) return null;
  const status = textField(body.status, 20);
  const reservationStatus = textField(body.reservationStatus, 20);
  if (!title || note === null || openingHours === null || location === null || !['want','planned','visited','skipped'].includes(status ?? '') || !['not_needed','unavailable','needed','requested','confirmed'].includes(reservationStatus ?? '')) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(location) && !/^https?:\/\//i.test(location)) return null;
  return { title, note, openingHours, location, status, reservationStatus, ...(referenceLinks === undefined ? {} : { referenceLinks }), ...(itineraryItemId === undefined ? {} : { itineraryItemId }) };
}
async function placesRoute(request: Request, env: Env, user: User, tripId: string, placeId?: string) {
  const forbidden = await requireMember(env, tripId, user.id);
  if (forbidden) return forbidden;
  if (!placeId && request.method === 'GET') {
    const rows = await env.DB.prepare(`SELECT p.id, p.title, p.note, p.opening_hours AS openingHours, COALESCE(d.reservation_status, p.reservation_status) AS reservationStatus, p.location, p.status, p.updated_at AS updatedAt, COALESCE(d.reference_links, '[]') AS referenceLinks, l.item_id AS itineraryItemId FROM places p LEFT JOIN place_itinerary_links l ON l.place_id = p.id LEFT JOIN place_details d ON d.place_id = p.id WHERE p.trip_id = ? ORDER BY p.updated_at DESC, p.id`).bind(tripId).all();
    return json({ places: rows.results.map((row) => ({ ...row, referenceLinks: JSON.parse(row.referenceLinks as string) })) });
  }
  if (placeId && request.method === 'DELETE') {
    await env.DB.prepare('DELETE FROM places WHERE trip_id = ? AND id = ?').bind(tripId, placeId).run();
    return new Response(null, { status: 204 });
  }
  if ((!placeId && request.method === 'POST') || (placeId && request.method === 'PATCH')) {
    const body = await request.json().catch(() => null);
    const fields = isObject(body) ? placeFields(body) : null;
    if (!fields) return json({ error: '場所の名前と入力内容を確認してください' }, 400);
    const { title, note, openingHours, reservationStatus, location, status, referenceLinks } = fields;
    if (fields.itineraryItemId) {
      const item = await env.DB.prepare('SELECT trip_id FROM itinerary_items WHERE id = ?').bind(fields.itineraryItemId).first<{ trip_id: string }>();
      if (item && item.trip_id !== tripId) return json({ error: 'この旅行の予定を選択してください' }, 400);
      // A queued place edit may refer to a plan deleted on another device.
      if (!item) fields.itineraryItemId = null;
    }
    const legacyReservationStatus = reservationStatus === 'unavailable' ? 'not_needed' : reservationStatus;
    const id = placeId ?? idField(body.id) ?? crypto.randomUUID();
    const statement = placeId
      ? await env.DB.prepare('UPDATE places SET title=?, note=?, opening_hours=?, reservation_status=?, location=?, status=?, updated_by=?, updated_at=unixepoch() WHERE id=? AND trip_id=?').bind(title, note, openingHours, legacyReservationStatus, location, status, user.id, id, tripId)
      : await env.DB.prepare(`INSERT INTO places (id, trip_id, title, note, opening_hours, reservation_status, location, status, updated_by) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title, note=excluded.note, opening_hours=excluded.opening_hours, reservation_status=excluded.reservation_status, location=excluded.location, status=excluded.status, updated_by=excluded.updated_by, updated_at=unixepoch() WHERE places.trip_id=excluded.trip_id`).bind(id, tripId, title, note, openingHours, legacyReservationStatus, location, status, user.id);
    const itemLink = env.DB.prepare(`INSERT INTO place_itinerary_links (place_id, item_id)
      SELECT ?, ? WHERE EXISTS (SELECT 1 FROM places WHERE id = ? AND trip_id = ?)
      ON CONFLICT(place_id) DO UPDATE SET item_id = CASE WHEN ? THEN excluded.item_id ELSE place_itinerary_links.item_id END
    `).bind(id, fields.itineraryItemId ?? null, id, tripId, fields.itineraryItemId !== undefined ? 1 : 0);
    const linksJson = referenceLinks === undefined ? null : JSON.stringify(referenceLinks);
    const [result] = await env.DB.batch([
      statement,
      itemLink,
      env.DB.prepare(`INSERT INTO place_details (place_id, reference_links, reservation_status)
        SELECT ?, COALESCE(?, '[]'), ? WHERE EXISTS (SELECT 1 FROM places WHERE id = ? AND trip_id = ?)
        ON CONFLICT(place_id) DO UPDATE SET reference_links = COALESCE(?, place_details.reference_links), reservation_status = excluded.reservation_status
      `).bind(id, linksJson, reservationStatus === 'unavailable' ? reservationStatus : null, id, tripId, linksJson),
    ]);
    if (!result.meta.changes) return json({ error: '場所が見つからないか、IDが競合しました' }, placeId ? 404 : 409);
    return json({ place: { id, ...fields } }, placeId ? 200 : 201);
  }
  return json({ error: 'Not found' }, 404);
}

async function notesRoute(request: Request, env: Env, user: User, tripId: string, noteId?: string) {
  const forbidden = await requireMember(env, tripId, user.id);
  if (forbidden) return forbidden;
  if (request.method === 'GET' && !noteId) {
    const rows = await env.DB.prepare('SELECT id, body, pinned, updated_at AS updatedAt FROM travel_notes WHERE trip_id=? ORDER BY pinned DESC, updated_at DESC, id').bind(tripId).all();
    return json({ notes: rows.results.map((row) => ({ ...row, pinned: Boolean(row.pinned) })) });
  }
  if (request.method === 'DELETE' && noteId) {
    await env.DB.prepare('DELETE FROM travel_notes WHERE id=? AND trip_id=?').bind(noteId, tripId).run();
    return new Response(null, { status: 204 });
  }
  if (request.method === 'POST' && !noteId) {
    const body = await request.json().catch(() => null);
    if (!isObject(body) || !idField(body.id) || typeof body.body !== 'string' || body.body.length > 50000 || typeof body.pinned !== 'boolean') return json({ error: 'メモは50,000文字以内で入力してください' }, 400);
    const result = await env.DB.prepare(`INSERT INTO travel_notes (id,trip_id,body,pinned,updated_by) VALUES (?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET body=excluded.body,pinned=excluded.pinned,updated_by=excluded.updated_by,updated_at=unixepoch()
      WHERE travel_notes.trip_id=excluded.trip_id`).bind(body.id, tripId, body.body, Number(body.pinned), user.id).run();
    if (!result.meta.changes) return json({ error: 'メモのIDが競合しました' }, 409);
    return json({ id: body.id }, 201);
  }
  return json({ error: 'Not found' }, 404);
}

async function listItems(env: Env, user: User, tripId: string) {
  const forbidden = await requireMember(env, tripId, user.id);
  if (forbidden) return forbidden;
  const result = await env.DB.prepare(`SELECT i.id, i.day, i.time, i.kind, i.title, i.note, i.updated_by AS updatedBy, i.updated_at AS updatedAt, d.details FROM itinerary_items i LEFT JOIN itinerary_details d ON d.item_id = i.id WHERE i.trip_id = ? ORDER BY i.day, i.time, i.id`)
    .bind(tripId)
    .all();
  return json({ items: result.results.map(({ details, ...item }) => ({ ...item, ...(details ? { details: JSON.parse(String(details)) } : {}) })) });
}

function parseItineraryDetails(value: unknown, day: string, time: string): ItineraryDetails | null | undefined {
  if (value === undefined) return undefined;
  if (!isObject(value) || typeof value.location !== 'string' || typeof value.endDay !== 'string' || typeof value.endTime !== 'string' || !itineraryCategories.some((category) => category.value === value.category)) return null;
  const location = textField(value.location, 160);
  const endDay = value.endDay === '' ? '' : dateField(value.endDay);
  const endTime = textField(value.endTime, 5);
  if (location === null || (endDay && !validDate(endDay)) || endDay === null || endTime === null || !/^([01]\d|2[0-3]):[0-5]\d$|^$/.test(endTime) || Boolean(endDay) !== Boolean(endTime)) return null;
  const details: ItineraryDetails = { category: value.category as ItineraryDetails['category'], location, endDay, endTime };
  if (value.category === 'transport') {
    const transport = value.transport;
    if (!isObject(transport) || typeof transport.origin !== 'string' || typeof transport.destination !== 'string' || !transportModes.some((mode) => mode.value === transport.mode)) return null;
    const origin = textField(transport.origin, 160), destination = textField(transport.destination, 160);
    const duration = transport.durationMinutes;
    const afterKey = transport.afterKey;
    if (afterKey !== undefined && (typeof afterKey !== 'string' || afterKey.length > 100 || !/^(item|booking)-[a-zA-Z0-9-]+$/.test(afterKey))) return null;
    if (origin === null || destination === null || (duration !== undefined && (typeof duration !== 'number' || !Number.isInteger(duration) || duration < 1 || duration > 10080))) return null;
    details.transport = { mode: transport.mode as NonNullable<ItineraryDetails['transport']>['mode'], origin, destination, ...(duration === undefined ? {} : { durationMinutes: duration as number }), ...(afterKey === undefined ? {} : { afterKey: afterKey as string }) };
  } else if (value.transport !== undefined) return null;
  return itineraryDetailsError(day, time, details) ? null : details;
}

function itineraryDetailsStatement(env: Env, itemId: string, tripId: string, details?: ItineraryDetails) {
  return env.DB.prepare(`INSERT INTO itinerary_details (item_id, details)
    SELECT ?, ? WHERE EXISTS (SELECT 1 FROM itinerary_items WHERE id = ? AND trip_id = ?)
    ON CONFLICT(item_id) DO UPDATE SET details = COALESCE(excluded.details, itinerary_details.details)`)
    .bind(itemId, details === undefined ? null : JSON.stringify(details), itemId, tripId);
}

function itineraryFields(body: Record<string, unknown>) {
  const day = dateField(body.day);
  const time = textField(body.time, 5);
  const kind = textField(body.kind, 32) || '予定';
  const title = textField(body.title, 160, true);
  const note = textField(body.note, 4000);
  if (!day || time === null || !/^([01]\d|2[0-3]):[0-5]\d$|^$/.test(time) || !kind || !title || note === null) return null;
  const details = parseItineraryDetails(body.details, day, time);
  if (details === null) return null;
  return { day, time, kind, title, note, ...(details === undefined ? {} : { details }) };
}

async function createItem(request: Request, env: Env, user: User, tripId: string) {
  const forbidden = await requireMember(env, tripId, user.id);
  if (forbidden) return forbidden;
  const body = await request.json().catch(() => null);
  const fields = isObject(body) ? itineraryFields(body) : null;
  if (!fields) return json({ error: '正しい旅程を入力してください' }, 400);
  const id = idField(body?.id) ?? crypto.randomUUID();
  const statement = env.DB.prepare(`
    INSERT INTO itinerary_items (id, trip_id, day, time, kind, title, note, updated_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      day = excluded.day,
      time = excluded.time,
      kind = excluded.kind,
      title = excluded.title,
      note = excluded.note,
      updated_by = excluded.updated_by,
      updated_at = unixepoch()
    WHERE itinerary_items.trip_id = excluded.trip_id
  `)
    .bind(id, tripId, fields.day, fields.time, fields.kind, fields.title, fields.note, user.id);
  const [result] = await env.DB.batch([statement, itineraryDetailsStatement(env, id, tripId, fields.details)]);
  if (!result.meta.changes) return json({ error: '旅程IDが競合しました' }, 409);
  return json({ item: { id, ...fields, updatedBy: user.id } }, 201);
}

async function updateItem(request: Request, env: Env, user: User, tripId: string, itemId: string) {
  const forbidden = await requireMember(env, tripId, user.id);
  if (forbidden) return forbidden;
  const body = await request.json().catch(() => null);
  const fields = isObject(body) ? itineraryFields(body) : null;
  if (!fields) return json({ error: '正しい旅程を入力してください' }, 400);
  const statement = env.DB.prepare(`UPDATE itinerary_items SET day = ?, time = ?, kind = ?, title = ?, note = ?, updated_by = ?, updated_at = unixepoch() WHERE id = ? AND trip_id = ?`)
    .bind(fields.day, fields.time, fields.kind, fields.title, fields.note, user.id, itemId, tripId);
  const [result] = await env.DB.batch([statement, itineraryDetailsStatement(env, itemId, tripId, fields.details)]);
  return result.meta.changes ? json({ item: { id: itemId, ...fields, updatedBy: user.id } }) : json({ error: '旅程が見つかりません' }, 404);
}

async function deleteItem(env: Env, user: User, tripId: string, itemId: string) {
  const forbidden = await requireMember(env, tripId, user.id);
  if (forbidden) return forbidden;
  const result = await env.DB.prepare('DELETE FROM itinerary_items WHERE id = ? AND trip_id = ?').bind(itemId, tripId).run();
  return result.meta.changes ? new Response(null, { status: 204 }) : json({ error: '旅程が見つかりません' }, 404);
}

const bookingKinds = new Set(['flight', 'hotel', 'train', 'car', 'restaurant', 'ticket', 'other']);

function bookingFields(body: Record<string, unknown>) {
  const kind = textField(body.kind, 24, true);
  const title = textField(body.title, 160, true);
  const detail = textField(body.detail, kind === 'hotel' ? 2000 : 500);
  const location = body.location === undefined ? undefined : textField(body.location, 2000);
  if (location === null || (location && !mapUrl(location))) return null;
  const origin = textField(body.origin, 160);
  const originCode = textField(body.originCode, 8);
  const destination = textField(body.destination, 160);
  const destinationCode = textField(body.destinationCode, 8);
  const day = dateField(body.day);
  const time = textField(body.time, 5);
  const endDay = body.endDay ? dateField(body.endDay) : day;
  const endTime = textField(body.endTime, 5);
  const confirmationCode = textField(body.confirmationCode, 120);
  const note = textField(body.note, 4000);
  const durationMinutes = body.durationMinutes;
  if (durationMinutes != null && (typeof durationMinutes !== 'number' || !Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 10080)) return null;
  if (!kind || !bookingKinds.has(kind) || !title || detail === null || origin === null || originCode === null || destination === null || destinationCode === null || !day || !endDay || (kind !== 'flight' && endDay < day) || time === null || endTime === null || !/^([01]\d|2[0-3]):[0-5]\d$|^$/.test(time) || !/^([01]\d|2[0-3]):[0-5]\d$|^$/.test(endTime) || confirmationCode === null || note === null) return null;
  return { kind, title, detail, ...(location !== undefined ? { location } : {}), origin, originCode: originCode.toUpperCase(), destination, destinationCode: destinationCode.toUpperCase(), day, time, endDay, endTime, confirmationCode, note, ...(durationMinutes === undefined ? {} : { durationMinutes: durationMinutes as number | null }) };
}

async function listBookings(env: Env, user: User, tripId: string) {
  const forbidden = await requireMember(env, tripId, user.id);
  if (forbidden) return forbidden;
  return json({ bookings: await readBookings(env, tripId) });
}

async function readBookings(env: Env, tripId: string) {
  const result = await env.DB.prepare(`
    SELECT b.id, b.kind, b.title, b.detail, b.day, b.time,
           COALESCE(l.location, CASE WHEN b.kind = 'hotel' THEN b.detail ELSE '' END) AS location,
           COALESCE(d.origin, '') AS origin, COALESCE(d.origin_code, '') AS originCode,
           COALESCE(d.destination, '') AS destination, COALESCE(d.destination_code, '') AS destinationCode,
           COALESCE(NULLIF(d.end_day, ''), b.day) AS endDay, COALESCE(d.end_time, '') AS endTime,
           b.confirmation_code AS confirmationCode, b.note, b.updated_by AS updatedBy, b.updated_at AS updatedAt,
           t.duration_minutes AS durationMinutes, COALESCE(c.mode, 'auto') AS connectionMode, c.departure_booking_id AS nextFlightId
    FROM bookings b LEFT JOIN booking_details d ON d.booking_id = b.id
    LEFT JOIN booking_locations l ON l.booking_id = b.id
    LEFT JOIN booking_durations t ON t.booking_id = b.id
    LEFT JOIN flight_connection_preferences c ON c.arrival_booking_id = b.id
    WHERE b.trip_id = ? ORDER BY b.day, b.time, b.id
  `)
    .bind(tripId)
    .all<FlightConnectionInput>();
  return result.results;
}

async function updateFlightConnection(request: Request, env: Env, user: User, tripId: string, bookingId: string) {
  const forbidden = await requireMember(env, tripId, user.id);
  if (forbidden) return forbidden;
  const body = await request.json().catch(() => null);
  if (!isObject(body) || !['auto', 'manual', 'none'].includes(String(body.mode))) return json({ error: '乗り継ぎの設定を確認してください' }, 400);
  const bookings = await readBookings(env, tripId);
  const arrival = bookings.find((booking) => booking.id === bookingId && booking.kind === 'flight');
  if (!arrival) return json({ error: '航空便が見つかりません' }, 404);
  const mode = body.mode as 'auto' | 'manual' | 'none';
  const nextFlightId = mode === 'manual' ? idField(body.nextFlightId) : null;
  if (mode === 'manual') {
    const departure = bookings.find((booking) => booking.id === nextFlightId);
    if (!departure || !connectionBetween(arrival, departure)) return json({ error: '同じ空港から到着後に出発する便を選んでください' }, 400);
    if (bookings.some((booking) => booking.id !== bookingId && booking.connectionMode === 'manual' && booking.nextFlightId === nextFlightId)) {
      return json({ error: 'この便は別の便の乗り継ぎ先です。先にそちらの紐づけを変更してください' }, 409);
    }
    if (createsFlightConnectionCycle(bookings, bookingId, departure.id)) {
      return json({ error: '便が循環するため紐づけできません。日時を確認してください' }, 400);
    }
  }
  if (mode === 'auto') {
    await env.DB.prepare('DELETE FROM flight_connection_preferences WHERE arrival_booking_id = ?').bind(bookingId).run();
  } else {
    try {
      await env.DB.prepare(`
        INSERT INTO flight_connection_preferences (arrival_booking_id, departure_booking_id, mode, updated_by)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(arrival_booking_id) DO UPDATE SET departure_booking_id = excluded.departure_booking_id,
          mode = excluded.mode, updated_by = excluded.updated_by, updated_at = unixepoch()
      `).bind(bookingId, nextFlightId, mode, user.id).run();
    } catch (cause) {
      if (cause instanceof Error && /UNIQUE|FOREIGN KEY/.test(cause.message)) return json({ error: '便の情報が変更されました。もう一度選び直してください' }, 409);
      throw cause;
    }
  }
  return json({ connectionMode: mode, nextFlightId });
}

async function createBooking(request: Request, env: Env, user: User, tripId: string) {
  const forbidden = await requireMember(env, tripId, user.id);
  if (forbidden) return forbidden;
  const body = await request.json().catch(() => null);
  const fields = isObject(body) ? bookingFields(body) : null;
  if (!fields) return json({ error: '正しい予約情報を入力してください' }, 400);
  const id = idField(body?.id) ?? crypto.randomUUID();
  const [bookingResult] = await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO bookings (id, trip_id, kind, title, detail, day, time, confirmation_code, note, updated_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        kind = excluded.kind, title = excluded.title, detail = excluded.detail,
        day = excluded.day, time = excluded.time, confirmation_code = excluded.confirmation_code,
        note = excluded.note, updated_by = excluded.updated_by, updated_at = unixepoch()
      WHERE bookings.trip_id = excluded.trip_id
    `).bind(id, tripId, fields.kind, fields.title, fields.detail, fields.day, fields.time, fields.confirmationCode, fields.note, user.id),
    env.DB.prepare(`
      INSERT INTO booking_details (booking_id, origin, origin_code, destination, destination_code, end_day, end_time)
      SELECT ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM bookings WHERE id = ? AND trip_id = ?)
      ON CONFLICT(booking_id) DO UPDATE SET
        origin = excluded.origin, origin_code = excluded.origin_code,
        destination = excluded.destination, destination_code = excluded.destination_code,
        end_day = excluded.end_day, end_time = excluded.end_time
    `).bind(id, fields.origin, fields.originCode, fields.destination, fields.destinationCode, fields.endDay, fields.endTime, id, tripId),
    ...(fields.location === undefined ? [] : [env.DB.prepare(`
      INSERT INTO booking_locations (booking_id, location)
      SELECT ?, ? WHERE EXISTS (SELECT 1 FROM bookings WHERE id = ? AND trip_id = ?)
      ON CONFLICT(booking_id) DO UPDATE SET location = excluded.location
    `).bind(id, fields.location, id, tripId)]),
    ...(fields.durationMinutes === undefined ? [] : [env.DB.prepare(`
      INSERT INTO booking_durations (booking_id, duration_minutes)
      SELECT ?, ? WHERE EXISTS (SELECT 1 FROM bookings WHERE id = ? AND trip_id = ?)
      ON CONFLICT(booking_id) DO UPDATE SET duration_minutes = excluded.duration_minutes
    `).bind(id, fields.durationMinutes, id, tripId)]),
  ]);
  if (!bookingResult.meta.changes) return json({ error: '予約IDが競合しました' }, 409);
  return json({ booking: { id, ...fields, updatedBy: user.id } }, 201);
}

async function updateBooking(request: Request, env: Env, user: User, tripId: string, bookingId: string) {
  const forbidden = await requireMember(env, tripId, user.id);
  if (forbidden) return forbidden;
  const body = await request.json().catch(() => null);
  const fields = isObject(body) ? bookingFields(body) : null;
  if (!fields) return json({ error: '正しい予約情報を入力してください' }, 400);
  const [bookingResult] = await env.DB.batch([
    env.DB.prepare(`UPDATE bookings SET kind = ?, title = ?, detail = ?, day = ?, time = ?, confirmation_code = ?, note = ?, updated_by = ?, updated_at = unixepoch() WHERE id = ? AND trip_id = ?`)
      .bind(fields.kind, fields.title, fields.detail, fields.day, fields.time, fields.confirmationCode, fields.note, user.id, bookingId, tripId),
    env.DB.prepare(`
      INSERT INTO booking_details (booking_id, origin, origin_code, destination, destination_code, end_day, end_time)
      SELECT ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM bookings WHERE id = ? AND trip_id = ?)
      ON CONFLICT(booking_id) DO UPDATE SET
        origin = excluded.origin, origin_code = excluded.origin_code,
        destination = excluded.destination, destination_code = excluded.destination_code,
        end_day = excluded.end_day, end_time = excluded.end_time
    `).bind(bookingId, fields.origin, fields.originCode, fields.destination, fields.destinationCode, fields.endDay, fields.endTime, bookingId, tripId),
    ...(fields.location === undefined ? [] : [env.DB.prepare(`
      INSERT INTO booking_locations (booking_id, location)
      SELECT ?, ? WHERE EXISTS (SELECT 1 FROM bookings WHERE id = ? AND trip_id = ?)
      ON CONFLICT(booking_id) DO UPDATE SET location = excluded.location
    `).bind(bookingId, fields.location, bookingId, tripId)]),
    ...(fields.durationMinutes === undefined ? [] : [env.DB.prepare(`
      INSERT INTO booking_durations (booking_id, duration_minutes)
      SELECT ?, ? WHERE EXISTS (SELECT 1 FROM bookings WHERE id = ? AND trip_id = ?)
      ON CONFLICT(booking_id) DO UPDATE SET duration_minutes = excluded.duration_minutes
    `).bind(bookingId, fields.durationMinutes, bookingId, tripId)]),
  ]);
  return bookingResult.meta.changes ? json({ booking: { id: bookingId, ...fields, updatedBy: user.id } }) : json({ error: '予約が見つかりません' }, 404);
}

async function deleteBooking(env: Env, user: User, tripId: string, bookingId: string) {
  const forbidden = await requireMember(env, tripId, user.id);
  if (forbidden) return forbidden;
  const documents = await env.DB.prepare('SELECT object_key AS objectKey FROM booking_documents WHERE booking_id = ? AND trip_id = ?')
    .bind(bookingId, tripId)
    .all<{ objectKey: string }>();
  const result = await env.DB.prepare('DELETE FROM bookings WHERE id = ? AND trip_id = ?').bind(bookingId, tripId).run();
  if (result.meta.changes && documents.results.length) await env.BUCKET.delete(documents.results.map((document) => document.objectKey));
  return result.meta.changes ? new Response(null, { status: 204 }) : json({ error: '予約が見つかりません' }, 404);
}

type BookingDocumentRow = {
  id: string;
  bookingId: string;
  filename: string;
  contentType: string;
  size: number;
  uploadedBy: string;
  createdAt: number;
  objectKey?: string;
};

const bookingDocumentTypes = new Set([
  'application/pdf',
  'image/gif',
  'image/heic',
  'image/heif',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

async function listBookingDocuments(env: Env, user: User, tripId: string) {
  const forbidden = await requireMember(env, tripId, user.id);
  if (forbidden) return forbidden;
  const result = await env.DB.prepare(`
    SELECT id, booking_id AS bookingId, filename, content_type AS contentType, size,
           uploaded_by AS uploadedBy, created_at AS createdAt
    FROM booking_documents WHERE trip_id = ? ORDER BY created_at, id
  `).bind(tripId).all<BookingDocumentRow>();
  return json({ documents: result.results });
}

async function uploadBookingDocument(request: Request, env: Env, user: User, tripId: string, bookingId: string) {
  const forbidden = await requireMember(env, tripId, user.id);
  if (forbidden) return forbidden;
  const booking = await env.DB.prepare('SELECT id FROM bookings WHERE id = ? AND trip_id = ?').bind(bookingId, tripId).first();
  if (!booking) return json({ error: '予約が見つかりません' }, 404);

  const contentType = (request.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  if (!bookingDocumentTypes.has(contentType)) return json({ error: 'JPEG、PNG、WebP、HEIC、GIF、PDFのいずれかを選択してください' }, 400);
  const declaredSize = Number(request.headers.get('x-file-size') ?? 0);
  if (!Number.isFinite(declaredSize) || declaredSize < 1 || declaredSize > 20 * 1024 * 1024) return json({ error: 'ファイルは20MB以下にしてください' }, 400);

  let decodedFilename = '';
  try {
    decodedFilename = decodeURIComponent(request.headers.get('x-filename') ?? '');
  } catch {
    return json({ error: 'ファイル名を確認してください' }, 400);
  }
  const filename = textField(decodedFilename, 180, true);
  if (!filename) return json({ error: 'ファイル名を確認してください' }, 400);
  const bytes = await request.arrayBuffer();
  if (bytes.byteLength < 1 || bytes.byteLength > 20 * 1024 * 1024 || bytes.byteLength !== declaredSize) return json({ error: 'ファイルサイズを確認してください' }, 400);

  const id = crypto.randomUUID();
  const objectKey = `trips/${tripId}/bookings/${bookingId}/${id}`;
  await env.BUCKET.put(objectKey, bytes, { httpMetadata: { contentType } });
  try {
    await env.DB.prepare(`
      INSERT INTO booking_documents (id, trip_id, booking_id, object_key, filename, content_type, size, uploaded_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(id, tripId, bookingId, objectKey, filename, contentType, bytes.byteLength, user.id).run();
  } catch (cause) {
    await env.BUCKET.delete(objectKey);
    throw cause;
  }
  return json({ document: { id, bookingId, filename, contentType, size: bytes.byteLength, uploadedBy: user.id, createdAt: Math.floor(Date.now() / 1000) } }, 201);
}

async function getBookingDocument(env: Env, user: User, tripId: string, bookingId: string, documentId: string) {
  const forbidden = await requireMember(env, tripId, user.id);
  if (forbidden) return forbidden;
  const document = await env.DB.prepare(`
    SELECT object_key AS objectKey, filename, content_type AS contentType
    FROM booking_documents WHERE id = ? AND booking_id = ? AND trip_id = ?
  `).bind(documentId, bookingId, tripId).first<BookingDocumentRow>();
  if (!document?.objectKey) return json({ error: '書類が見つかりません' }, 404);
  const object = await env.BUCKET.get(document.objectKey);
  if (!object) return json({ error: '書類の原本が見つかりません' }, 404);
  return new Response(object.body, { headers: {
    'content-type': document.contentType,
    'content-length': String(object.size),
    'content-disposition': `inline; filename*=UTF-8''${encodeURIComponent(document.filename)}`,
    'cache-control': 'private, no-store',
  } });
}

async function deleteBookingDocument(env: Env, user: User, tripId: string, bookingId: string, documentId: string) {
  const forbidden = await requireMember(env, tripId, user.id);
  if (forbidden) return forbidden;
  const document = await env.DB.prepare(`
    DELETE FROM booking_documents WHERE id = ? AND booking_id = ? AND trip_id = ?
    RETURNING object_key AS objectKey
  `).bind(documentId, bookingId, tripId).first<{ objectKey: string }>();
  if (!document) return json({ error: '書類が見つかりません' }, 404);
  await env.BUCKET.delete(document.objectKey);
  return new Response(null, { status: 204 });
}

type PackingRow = {
  id: string;
  name: string;
  category: string;
  quantity: number;
  packed: number;
  assignee: string;
  shared: number;
  updatedBy: string;
  updatedAt: number;
};

function packingFields(body: Record<string, unknown>) {
  const name = textField(body.name, 120, true);
  const category = textField(body.category, 40) || 'その他';
  const quantity = typeof body.quantity === 'number' && Number.isInteger(body.quantity) ? body.quantity : 1;
  const packed = typeof body.packed === 'boolean' ? body.packed : false;
  if (!name || !category || quantity < 1 || quantity > 99) return null;
  const assignee = body.assignee === undefined ? undefined : typeof body.assignee === 'string' ? textField(body.assignee, 80) : null;
  const shared = body.shared;
  if (assignee === null || (shared !== undefined && typeof shared !== 'boolean')) return null;
  return { name, category, quantity, packed, assignee, shared };
}

async function listPacking(env: Env, user: User, tripId: string) {
  const forbidden = await requireMember(env, tripId, user.id);
  if (forbidden) return forbidden;
  const result = await env.DB.prepare(`
    SELECT p.id, p.name, p.category, p.quantity, p.packed, p.updated_by AS updatedBy, p.updated_at AS updatedAt,
      COALESCE(d.assignee, '') AS assignee, COALESCE(d.shared, 0) AS shared
    FROM packing_items p LEFT JOIN packing_details d ON d.item_id = p.id
    WHERE p.trip_id = ? ORDER BY p.packed, p.category, p.name, p.id
  `).bind(tripId).all<PackingRow>();
  return json({ items: result.results.map((item) => ({ ...item, packed: Boolean(item.packed), shared: Boolean(item.shared) })) });
}

async function validatePackingAssignee(env: Env, tripId: string, assignee: string | undefined, itemId: string) {
  if (!assignee) return null;
  if (assignee.startsWith('member:') && await memberRole(env, tripId, assignee.slice(7))) return null;
  const existing = await env.DB.prepare(`SELECT d.assignee FROM packing_details d JOIN packing_items p ON p.id = d.item_id WHERE p.id = ? AND p.trip_id = ?`).bind(itemId, tripId).first<{ assignee: string }>();
  if (existing?.assignee === assignee) return null;
  return json({ error: 'この旅行のメンバーから担当を選んでください' }, 400);
}

async function writePackingItem(request: Request, env: Env, user: User, tripId: string, itemId?: string) {
  const forbidden = await requireMember(env, tripId, user.id);
  if (forbidden) return forbidden;
  const body = await request.json().catch(() => null);
  const fields = isObject(body) ? packingFields(body) : null;
  if (!fields) return json({ error: '正しい持ち物情報を入力してください' }, 400);
  const id = itemId ?? idField(body?.id) ?? crypto.randomUUID();
  const invalidAssignee = await validatePackingAssignee(env, tripId, fields.assignee, id);
  if (invalidAssignee) return invalidAssignee;
  const statement = itemId
    ? env.DB.prepare(`UPDATE packing_items SET name = ?, category = ?, quantity = ?, packed = ?, updated_by = ?, updated_at = unixepoch() WHERE id = ? AND trip_id = ?`)
      .bind(fields.name, fields.category, fields.quantity, fields.packed ? 1 : 0, user.id, id, tripId)
    : env.DB.prepare(`INSERT INTO packing_items (id, trip_id, name, category, quantity, packed, updated_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET name = excluded.name, category = excluded.category, quantity = excluded.quantity,
        packed = excluded.packed, updated_by = excluded.updated_by, updated_at = unixepoch()
      WHERE packing_items.trip_id = excluded.trip_id`)
      .bind(id, tripId, fields.name, fields.category, fields.quantity, fields.packed ? 1 : 0, user.id);
  // Omitted fields from older/offline clients must not clear the assignment.
  const assignee = fields.assignee ?? null;
  const shared = fields.shared === undefined ? null : fields.shared ? 1 : 0;
  const [result] = await env.DB.batch([
    statement,
    env.DB.prepare(`INSERT INTO packing_details (item_id, assignee, shared)
      SELECT ?, COALESCE(?, ''), COALESCE(?, 0) WHERE EXISTS (SELECT 1 FROM packing_items WHERE id = ? AND trip_id = ?)
      ON CONFLICT(item_id) DO UPDATE SET assignee = COALESCE(?, packing_details.assignee), shared = COALESCE(?, packing_details.shared)`)
      .bind(id, assignee, shared, id, tripId, assignee, shared),
  ]);
  if (!result.meta.changes) return json({ error: '持ち物が見つからないか、IDが競合しました' }, itemId ? 404 : 409);
  const details = await env.DB.prepare('SELECT assignee, shared FROM packing_details WHERE item_id = ?').bind(id).first<{ assignee: string; shared: number }>();
  return json({ item: { id, ...fields, assignee: details?.assignee ?? '', shared: Boolean(details?.shared), updatedBy: user.id } }, itemId ? 200 : 201);
}

const createPackingItem = (request: Request, env: Env, user: User, tripId: string) => writePackingItem(request, env, user, tripId);
const updatePackingItem = (request: Request, env: Env, user: User, tripId: string, itemId: string) => writePackingItem(request, env, user, tripId, itemId);

async function deletePackingItem(env: Env, user: User, tripId: string, itemId: string) {
  const forbidden = await requireMember(env, tripId, user.id);
  if (forbidden) return forbidden;
  const result = await env.DB.prepare('DELETE FROM packing_items WHERE id = ? AND trip_id = ?').bind(itemId, tripId).run();
  return result.meta.changes ? new Response(null, { status: 204 }) : json({ error: '持ち物が見つかりません' }, 404);
}

type TaskRow = {
  id: string;
  title: string;
  dueOn: string;
  assignee: string;
  done: number;
  updatedBy: string;
  updatedAt: number;
};

function taskFields(body: Record<string, unknown>) {
  const title = textField(body.title, 160, true);
  const dueOn = body.dueOn === '' ? '' : dateField(body.dueOn);
  const assignee = textField(body.assignee, 80);
  const done = typeof body.done === 'boolean' ? body.done : false;
  if (!title || dueOn === null || assignee === null) return null;
  return { title, dueOn, assignee, done };
}

async function listTasks(env: Env, user: User, tripId: string) {
  const forbidden = await requireMember(env, tripId, user.id);
  if (forbidden) return forbidden;
  const result = await env.DB.prepare(`
    SELECT id, title, due_on AS dueOn, assignee, done, updated_by AS updatedBy, updated_at AS updatedAt
    FROM travel_tasks WHERE trip_id = ? ORDER BY done, CASE WHEN due_on = '' THEN 1 ELSE 0 END, due_on, title, id
  `).bind(tripId).all<TaskRow>();
  return json({ tasks: result.results.map((task) => ({ ...task, done: Boolean(task.done) })) });
}

async function validateAssignee(env: Env, tripId: string, assignee: string, taskId: string | null) {
  if (!assignee) return null;
  if (assignee.startsWith('member:') && await memberRole(env, tripId, assignee.slice(7))) return null;
  const existing = taskId ? await env.DB.prepare('SELECT assignee FROM travel_tasks WHERE id = ? AND trip_id = ?').bind(taskId, tripId).first<{ assignee: string }>() : null;
  if (existing?.assignee === assignee) return null;
  return json({ error: 'この旅行のメンバーから担当を選んでください' }, 400);
}

async function createTask(request: Request, env: Env, user: User, tripId: string) {
  const forbidden = await requireMember(env, tripId, user.id);
  if (forbidden) return forbidden;
  const body = await request.json().catch(() => null);
  const fields = isObject(body) ? taskFields(body) : null;
  if (!fields) return json({ error: '正しいタスク情報を入力してください' }, 400);
  const id = idField(body?.id) ?? crypto.randomUUID();
  const invalidAssignee = await validateAssignee(env, tripId, fields.assignee, id);
  if (invalidAssignee) return invalidAssignee;
  const result = await env.DB.prepare(`
    INSERT INTO travel_tasks (id, trip_id, title, due_on, assignee, done, updated_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title, due_on = excluded.due_on, assignee = excluded.assignee,
      done = excluded.done, updated_by = excluded.updated_by, updated_at = unixepoch()
    WHERE travel_tasks.trip_id = excluded.trip_id
  `).bind(id, tripId, fields.title, fields.dueOn, fields.assignee, fields.done ? 1 : 0, user.id).run();
  if (!result.meta.changes) return json({ error: 'タスクIDが競合しました' }, 409);
  return json({ task: { id, ...fields, updatedBy: user.id } }, 201);
}

async function updateTask(request: Request, env: Env, user: User, tripId: string, taskId: string) {
  const forbidden = await requireMember(env, tripId, user.id);
  if (forbidden) return forbidden;
  const body = await request.json().catch(() => null);
  const fields = isObject(body) ? taskFields(body) : null;
  if (!fields) return json({ error: '正しいタスク情報を入力してください' }, 400);
  const invalidAssignee = await validateAssignee(env, tripId, fields.assignee, taskId);
  if (invalidAssignee) return invalidAssignee;
  const result = await env.DB.prepare(`
    UPDATE travel_tasks SET title = ?, due_on = ?, assignee = ?, done = ?, updated_by = ?, updated_at = unixepoch()
    WHERE id = ? AND trip_id = ?
  `).bind(fields.title, fields.dueOn, fields.assignee, fields.done ? 1 : 0, user.id, taskId, tripId).run();
  return result.meta.changes
    ? json({ task: { id: taskId, ...fields, updatedBy: user.id } })
    : json({ error: 'タスクが見つかりません' }, 404);
}

async function deleteTask(env: Env, user: User, tripId: string, taskId: string) {
  const forbidden = await requireMember(env, tripId, user.id);
  if (forbidden) return forbidden;
  const result = await env.DB.prepare('DELETE FROM travel_tasks WHERE id = ? AND trip_id = ?').bind(taskId, tripId).run();
  return result.meta.changes ? new Response(null, { status: 204 }) : json({ error: 'タスクが見つかりません' }, 404);
}

async function requireOwner(env: Env, tripId: string, userId: string) {
  return await memberRole(env, tripId, userId) === 'owner' ? null : json({ error: 'メンバーを管理できるのは管理者だけです' }, 403);
}

async function membersRoute(request: Request, env: Env, user: User, tripId: string, memberId?: string) {
  const forbidden = await requireMember(env, tripId, user.id);
  if (forbidden) return forbidden;
  if (request.method === 'GET' && !memberId) {
    const members = await env.DB.prepare(`SELECT u.id, u.display_name AS name, u.email, up.avatar_url AS avatarUrl,
      CASE WHEN tm.role = 'owner' THEN 'owner' WHEN mp.read_only = 1 THEN 'viewer' ELSE tm.role END AS role
      FROM trip_members tm JOIN users u ON u.id = tm.user_id LEFT JOIN user_profiles up ON up.user_id = u.id
      LEFT JOIN trip_member_permissions mp ON mp.trip_id = tm.trip_id AND mp.user_id = tm.user_id
      WHERE tm.trip_id = ? ORDER BY tm.role = 'owner' DESC, tm.joined_at, u.id`).bind(tripId).all();
    return json({ members: members.results });
  }
  const notOwner = await requireOwner(env, tripId, user.id);
  if (notOwner) return notOwner;
  if (!memberId || !['PATCH', 'DELETE'].includes(request.method)) return json({ error: 'Not found' }, 404);
  const target = await memberRole(env, tripId, memberId);
  if (!target) return json({ error: 'メンバーが見つかりません' }, 404);
  if (target === 'owner') return json({ error: '管理者の削除・権限変更はできません' }, 409);
  if (request.method === 'PATCH') {
    const body = await request.json().catch(() => null) as { role?: unknown } | null;
    if (body?.role !== 'editor' && body?.role !== 'viewer') return json({ error: '編集可または閲覧のみを選択してください' }, 400);
    await env.DB.prepare(`INSERT INTO trip_member_permissions (trip_id, user_id, read_only)
      SELECT trip_id, user_id, ? FROM trip_members WHERE trip_id = ? AND user_id = ? AND role != 'owner'
      ON CONFLICT(trip_id, user_id) DO UPDATE SET read_only = excluded.read_only`)
      .bind(body.role === 'viewer' ? 1 : 0, tripId, memberId).run();
    return json({ role: body.role });
  }
  await env.DB.batch([
    env.DB.prepare('DELETE FROM invites WHERE trip_id = ? AND consumed_at IS NULL').bind(tripId),
    env.DB.prepare("DELETE FROM trip_members WHERE trip_id = ? AND user_id = ? AND role != 'owner'").bind(tripId, memberId),
  ]);
  return new Response(null, { status: 204 });
}

async function revokeInvites(env: Env, user: User, tripId: string) {
  const forbidden = await requireOwner(env, tripId, user.id);
  if (forbidden) return forbidden;
  await env.DB.prepare('DELETE FROM invites WHERE trip_id = ? AND consumed_at IS NULL').bind(tripId).run();
  return new Response(null, { status: 204 });
}

async function createInvite(env: Env, user: User, tripId: string, url: URL) {
  const forbidden = await requireOwner(env, tripId, user.id);
  if (forbidden) return forbidden;
  const token = randomToken();
  await env.DB.prepare('INSERT INTO invites (token_hash, trip_id, created_by, expires_at) VALUES (?, ?, ?, unixepoch() + 604800)')
    .bind(await hashToken(token), tripId, user.id).run();
  return json({ invite: { url: `${url.origin}/?invite=${encodeURIComponent(token)}`, expiresIn: 604800 } }, 201);
}

async function acceptInvite(env: Env, user: User, token: string) {
  const tokenHash = await hashToken(token);
  const invite = await env.DB.prepare(`
    UPDATE invites
    SET consumed_by = ?, consumed_at = unixepoch()
    WHERE token_hash = ? AND expires_at > unixepoch() AND consumed_at IS NULL
      AND EXISTS (SELECT 1 FROM trip_members tm WHERE tm.trip_id = invites.trip_id AND tm.user_id = invites.created_by AND tm.role = 'owner')
    RETURNING trip_id AS tripId
  `)
    .bind(user.id, tokenHash)
    .first<{ tripId: string }>();
  if (!invite) return json({ error: '招待リンクが無効か期限切れです' }, 404);
  await env.DB.prepare("INSERT INTO trip_members (trip_id, user_id, role) VALUES (?, ?, 'editor') ON CONFLICT(trip_id, user_id) DO NOTHING")
    .bind(invite.tripId, user.id)
    .run();
  return json({ tripId: invite.tripId });
}

async function api(request: Request, env: Env, url: URL) {
  if (request.method === 'POST' && url.pathname === '/v1/auth/google') return googleLogin(request, env);
  const user = await currentUser(request, env);
  if (!user) return json({ error: 'ログインが必要です' }, 401);
  if (request.method === 'GET' && url.pathname === '/v1/me') return json({ user });
  if (request.method === 'PATCH' && url.pathname === '/v1/me') {
    const body = await request.json().catch(() => null);
    const name = isObject(body) ? textField(body.name, 100, true) : null;
    if (!name) return json({ error: '表示名は1〜100文字で入力してください' }, 400);
    await env.DB.prepare('UPDATE users SET display_name = ?, updated_at = unixepoch() WHERE id = ?').bind(name, user.id).run();
    return json({ user: { ...user, name } });
  }
  if (request.method === 'POST' && url.pathname === '/v1/auth/logout') {
    const token = request.headers.get('authorization')?.slice(7);
    if (token) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await hashToken(token)).run();
    return json({ ok: true });
  }
  if (request.method === 'GET' && url.pathname === '/v1/trips') return listTrips(env, user);
  if (request.method === 'POST' && url.pathname === '/v1/trips') return createTrip(request, env, user);

  // This gate also protects old clients and document uploads after a role change.
  const scope = url.pathname.match(/^\/v1\/trips\/([^/]+)(?:\/|$)/);
  if (scope && request.method !== 'GET' && await memberRole(env, scope[1], user.id) === 'viewer') {
    return json({ error: 'この旅行は閲覧のみです' }, 403);
  }
  const membersMatch = url.pathname.match(/^\/v1\/trips\/([^/]+)\/members(?:\/([^/]+))?$/);
  if (membersMatch) return membersRoute(request, env, user, membersMatch[1], membersMatch[2]);
  const tripMatch = url.pathname.match(/^\/v1\/trips\/([^/]+)$/);
  if (tripMatch && request.method === 'DELETE') return deleteTrip(env, user, tripMatch[1]);
  const notesMatch = url.pathname.match(/^\/v1\/trips\/([^/]+)\/notes(?:\/([^/]+))?$/);
  if (notesMatch) return notesRoute(request, env, user, notesMatch[1], notesMatch[2]);
  const placesMatch = url.pathname.match(/^\/v1\/trips\/([^/]+)\/places(?:\/([^/]+))?$/);
  if (placesMatch) return placesRoute(request, env, user, placesMatch[1], placesMatch[2]);
  if (tripMatch && request.method === 'PATCH') return updateTrip(request, env, user, tripMatch[1]);

  const itemsMatch = url.pathname.match(/^\/v1\/trips\/([^/]+)\/items$/);
  if (itemsMatch && request.method === 'GET') return listItems(env, user, itemsMatch[1]);
  if (itemsMatch && request.method === 'POST') return createItem(request, env, user, itemsMatch[1]);

  const itemMatch = url.pathname.match(/^\/v1\/trips\/([^/]+)\/items\/([^/]+)$/);
  if (itemMatch && request.method === 'PATCH') return updateItem(request, env, user, itemMatch[1], itemMatch[2]);
  if (itemMatch && request.method === 'DELETE') return deleteItem(env, user, itemMatch[1], itemMatch[2]);

  const bookingsMatch = url.pathname.match(/^\/v1\/trips\/([^/]+)\/bookings$/);
  if (bookingsMatch && request.method === 'GET') return listBookings(env, user, bookingsMatch[1]);
  if (bookingsMatch && request.method === 'POST') return createBooking(request, env, user, bookingsMatch[1]);

  const bookingMatch = url.pathname.match(/^\/v1\/trips\/([^/]+)\/bookings\/([^/]+)$/);
  if (bookingMatch && request.method === 'PATCH') return updateBooking(request, env, user, bookingMatch[1], bookingMatch[2]);
  if (bookingMatch && request.method === 'DELETE') return deleteBooking(env, user, bookingMatch[1], bookingMatch[2]);

  const connectionMatch = url.pathname.match(/^\/v1\/trips\/([^/]+)\/bookings\/([^/]+)\/connection$/);
  if (connectionMatch && request.method === 'PATCH') return updateFlightConnection(request, env, user, connectionMatch[1], connectionMatch[2]);

  const bookingDocumentsMatch = url.pathname.match(/^\/v1\/trips\/([^/]+)\/booking-documents$/);
  if (bookingDocumentsMatch && request.method === 'GET') return listBookingDocuments(env, user, bookingDocumentsMatch[1]);

  const bookingDocumentCollectionMatch = url.pathname.match(/^\/v1\/trips\/([^/]+)\/bookings\/([^/]+)\/documents$/);
  if (bookingDocumentCollectionMatch && request.method === 'POST') return uploadBookingDocument(request, env, user, bookingDocumentCollectionMatch[1], bookingDocumentCollectionMatch[2]);

  const bookingDocumentMatch = url.pathname.match(/^\/v1\/trips\/([^/]+)\/bookings\/([^/]+)\/documents\/([^/]+)$/);
  if (bookingDocumentMatch && request.method === 'GET') return getBookingDocument(env, user, bookingDocumentMatch[1], bookingDocumentMatch[2], bookingDocumentMatch[3]);
  if (bookingDocumentMatch && request.method === 'DELETE') return deleteBookingDocument(env, user, bookingDocumentMatch[1], bookingDocumentMatch[2], bookingDocumentMatch[3]);

  const packingItemsMatch = url.pathname.match(/^\/v1\/trips\/([^/]+)\/packing$/);
  if (packingItemsMatch && request.method === 'GET') return listPacking(env, user, packingItemsMatch[1]);
  if (packingItemsMatch && request.method === 'POST') return createPackingItem(request, env, user, packingItemsMatch[1]);

  const packingItemMatch = url.pathname.match(/^\/v1\/trips\/([^/]+)\/packing\/([^/]+)$/);
  if (packingItemMatch && request.method === 'PATCH') return updatePackingItem(request, env, user, packingItemMatch[1], packingItemMatch[2]);
  if (packingItemMatch && request.method === 'DELETE') return deletePackingItem(env, user, packingItemMatch[1], packingItemMatch[2]);

  const tasksMatch = url.pathname.match(/^\/v1\/trips\/([^/]+)\/tasks$/);
  if (tasksMatch && request.method === 'GET') return listTasks(env, user, tasksMatch[1]);
  if (tasksMatch && request.method === 'POST') return createTask(request, env, user, tasksMatch[1]);

  const taskMatch = url.pathname.match(/^\/v1\/trips\/([^/]+)\/tasks\/([^/]+)$/);
  if (taskMatch && request.method === 'PATCH') return updateTask(request, env, user, taskMatch[1], taskMatch[2]);
  if (taskMatch && request.method === 'DELETE') return deleteTask(env, user, taskMatch[1], taskMatch[2]);

  const inviteMatch = url.pathname.match(/^\/v1\/trips\/([^/]+)\/invites$/);
  if (inviteMatch && request.method === 'DELETE') return revokeInvites(env, user, inviteMatch[1]);
  if (inviteMatch && request.method === 'POST') return createInvite(env, user, inviteMatch[1], url);
  const acceptMatch = url.pathname.match(/^\/v1\/invites\/([^/]+)\/accept$/);
  if (acceptMatch && request.method === 'POST') return acceptInvite(env, user, acceptMatch[1]);
  return json({ error: 'Not found' }, 404);
}

const worker = {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);
    const corsHeaders = cors(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
    if (url.pathname.startsWith('/v1/')) {
      const response = await api(request, env, url);
      corsHeaders.forEach((value, key) => response.headers.set(key, value));
      return response;
    }
    return env.ASSETS.fetch(request);
  },
};

export default worker;
