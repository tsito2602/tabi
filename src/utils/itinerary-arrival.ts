// A local, one-use visual handoff. It is never persisted or synchronized.
// Old URLs, reloads and another traveller's edits cannot replay an insertion.
let sequence = 0;
let pending: { tripId: string; itemId: string; token: string; expires: number } | undefined;
export function queueItineraryArrival(tripId: string, itemId: string, now = Date.now()) {
  const token = `${now}-${++sequence}`;
  pending = { tripId, itemId, token, expires: now + 30000 };
  return token;
}
export function hasItineraryArrival(tripId: string, itemId: string, token?: string, now = Date.now()) {
  return Boolean(pending && pending.expires > now && pending.tripId === tripId && pending.itemId === itemId && pending.token === token);
}
export function takeItineraryArrival(tripId: string, itemId: string, token?: string, now = Date.now()) {
  if (!hasItineraryArrival(tripId, itemId, token, now)) return false;
  pending = undefined;
  return true;
}
export function cancelItineraryArrival(token?: string) {
  if (pending?.token === token) pending = undefined;
}

// Every offset is relative to its immediate layout parent. Do not assume a
// fixed date-header height: long titles, safe areas and desktop widths vary.
export function itineraryItemOffset(sheet: number | undefined, timeline: number | undefined, day: number | undefined, body: number | undefined, item: number | undefined, stickyHeader: number) {
  const values = [sheet, timeline, day, body, item];
  if (!values.every((value) => value !== undefined && Number.isFinite(value))) return;
  return Math.max(0, (sheet! + timeline! + day! + body! + item!) - stickyHeader - 10);
}
