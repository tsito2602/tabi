import type { ItineraryItem, ItineraryPlacement } from './types';
import { validDate } from '../utils/dates';

export type PlacementSlot = Pick<ItineraryPlacement, 'day' | 'beforeKey' | 'afterKey'>;
type Entry = { key: string; day: string; time: string; item?: ItineraryItem };
const clock = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const digits = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const validOrderKey = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 512 && /^[0-9A-Za-z]+$/.test(value) && !value.endsWith('0');
const entryKey = /^(?:item|booking)-[a-zA-Z0-9-]+$/;
export const validPlanTime = (value: string) => value === '' || clock.test(value);

/** Shared by the API and client. Unknown/corrupt metadata cannot reorder rows. */
export function parseItineraryPlacement(value: unknown): ItineraryPlacement | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const p = value as Record<string, unknown>;
  const key = (x: unknown): x is string | null => x === null || (typeof x === 'string' && x.length <= 100 && entryKey.test(x));
  if (typeof p.day !== 'string' || !validDate(p.day) || typeof p.time !== 'string' || !validPlanTime(p.time)
    || !key(p.beforeKey) || !key(p.afterKey) || (p.beforeKey && p.beforeKey === p.afterKey)
    || (p.orderKey !== undefined && !validOrderKey(p.orderKey))
    || typeof p.sequence !== 'number' || !Number.isSafeInteger(p.sequence) || p.sequence < 1 || p.sequence > 1e12) return null;
  return { day: p.day, time: p.time, beforeKey: p.beforeKey, afterKey: p.afterKey, sequence: p.sequence, ...(p.orderKey === undefined ? {} : { orderKey: p.orderKey as string }) };
}

export function nextPlacementSequence(items: readonly ItineraryItem[]) {
  const latest = items.reduce((max, item) => Math.max(max, parseItineraryPlacement(item.details?.placement)?.sequence ?? 0), 0);
  if (latest >= 1e12) throw new Error('並び順を更新できません。予定の日時から編集してください。');
  return latest + 1;
}

/** Index within ONE day, excluding the moved row. No stale cross-day anchor. */
export function placementIndex(entries: readonly Entry[], slot: PlacementSlot) {
  const before = slot.beforeKey ? entries.findIndex(e => e.key === slot.beforeKey && e.day === slot.day) : -1;
  const after = slot.afterKey ? entries.findIndex(e => e.key === slot.afterKey && e.day === slot.day) : -1;
  if (before >= 0) return before;
  if (after >= 0) return after + 1;
  if (slot.beforeKey || slot.afterKey) return -1;
  return entries.length;
}

export function placementTimeConflict(entries: readonly Entry[], index: number, time: string) {
  if (!time) return '';
  const earlier = entries.slice(0, index).filter(e => clock.test(e.time)).map(e => e.time).sort().at(-1);
  const later = entries.slice(index).filter(e => clock.test(e.time)).map(e => e.time).sort()[0];
  if (earlier && time < earlier) return `${earlier}以降の時刻を選ぶか、時刻未定にしてください。`;
  if (later && time > later) return `${later}以前の時刻を選ぶか、時刻未定にしてください。`;
  return '';
}

// Stable fractional keys keep untouched cards in place when the same item is
// moved repeatedly. Replaying only its last anchor command loses older moves.
const baselineKey = (entry: Entry) => `${entry.time.replace(':', '') || '9999'}${entry.item?.details?.category === 'transport' ? '1' : '0'}${Array.from(entry.key).map(c => c.charCodeAt(0).toString(16).padStart(4, '0')).join('')}V`;
const activePlacement = (entry: Entry) => {
  const p = parseItineraryPlacement(entry.item?.details?.placement);
  return p && p.day === entry.day && p.time === entry.time && entry.item?.details?.category !== 'transport'
    && p.beforeKey !== entry.key && p.afterKey !== entry.key ? p : null;
};
export function orderKeyBetween(lower: string | null, upper: string | null): string {
  if (lower !== null && !validOrderKey(lower) || upper !== null && !validOrderKey(upper) || lower !== null && upper !== null && lower >= upper) {
    throw new Error('配置先の並びが変更されました。別の位置を選び直してください。');
  }
  let result = '', at = 0;
  for (;;) {
    if (result.length >= 512) throw new Error('この位置にはこれ以上配置できません。別の位置を選んでください。');
    const a = at < (lower?.length ?? 0) ? digits.indexOf(lower![at]) : 0;
    const b = upper === null ? digits.length : at < upper.length ? digits.indexOf(upper[at]) : 0;
    if (b - a > 1) return result + digits[Math.floor((a + b) / 2)];
    result += digits[a]; at++;
    if (a < b) upper = null;
  }
}
export function placementOrderKey(entries: readonly Entry[], index: number) {
  const chronological = [...entries].sort((a, b) => a.day.localeCompare(b.day) || compareKey(baselineKey(a), baselineKey(b)));
  const { ranked } = resolveRankedEntries(chronological);
  let previous = entries[index - 1];
  if (previous?.item?.details?.category === 'transport') {
    const anchor = entries.find(e => e.key === previous.item?.details?.transport?.afterKey);
    if (anchor && anchor.day === previous.day && (!previous.time || previous.time === anchor.time)
      && anchor.item?.details?.category !== 'transport') previous = anchor;
  }
  const key = (entry: Entry) => ranked.get(entry) ?? baselineKey(entry);
  return orderKeyBetween(previous ? key(previous) : null, index < entries.length ? key(entries[index]) : null);
}

// Legacy records keep their exact chronological order. Only explicit placement
// metadata changes it; booking endpoints never acquire a movable key.
function resolveRankedEntries<T extends Entry>(chronological: readonly T[]) {
  let result = [...chronological];
  const placed = chronological.flatMap(entry => {
    const p = activePlacement(entry);
    return p ? [{ entry, p }] : [];
  }).sort((a, b) => a.p.sequence - b.p.sequence || a.entry.key.localeCompare(b.entry.key));
  const ranked = new Map<T, string>();
  for (const { entry, p } of placed) {
    const day = chronological.filter(e => e.day === entry.day && e !== entry);
    if (p.orderKey && placementIndex(day, p) >= 0) ranked.set(entry, p.orderKey);
  }
  const sortRanks = () => {
    if (!ranked.size) return [...chronological];
    return [...chronological].sort((a, b) => a.day.localeCompare(b.day)
      || compareKey(ranked.get(a) ?? baselineKey(a), ranked.get(b) ?? baselineKey(b))
      || a.key.localeCompare(b.key));
  };
  result = sortRanks();
  // Later edits can invalidate the temporal interval in which a timed card
  // was placed. Fall back for that card, rather than falsifying its clock.
  for (const { entry } of placed) {
    if (!ranked.has(entry) || !entry.time) continue;
    const day = result.filter(e => e.day === entry.day);
    const index = day.indexOf(entry);
    if (placementTimeConflict(day.filter(e => e !== entry), index, entry.time)) { ranked.delete(entry); result = sortRanks(); }
  }
  return { result, ranked, placed };
}
export function applyItineraryPlacements<T extends Entry>(chronological: readonly T[]): T[] {
  const { result, placed } = resolveRankedEntries(chronological);
  // Accept earlier anchor-only metadata without a data migration.
  for (const { entry, p } of placed.filter(({ p }) => !p.orderKey)) {
    const day = result.filter(e => e.day === entry.day && e !== entry);
    const index = placementIndex(day, p);
    if (index < 0 || placementTimeConflict(day, index, entry.time)) continue;
    result.splice(result.indexOf(entry), 1);
    const anchor = day[index], previous = day[index - 1];
    const globalIndex = anchor ? result.indexOf(anchor) : previous ? result.indexOf(previous) + 1 : result.findIndex(e => e.day > entry.day);
    result.splice(globalIndex < 0 ? result.length : globalIndex, 0, entry);
  }
  return result;
}
function compareKey(a: string, b: string) { return a < b ? -1 : a > b ? 1 : 0; }
