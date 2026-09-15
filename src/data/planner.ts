import type { Booking, ItineraryItem, ItineraryPlacement, Place, Trip } from './types';
import { emptyItineraryDetails, itemDetails, itineraryDetailsError } from './itinerary';
import { itineraryTimeline } from './itinerary-timeline';
import { nextPlacementSequence, parseItineraryPlacement, placementIndex, placementTimeConflict, placementOrderKey, validPlanTime, type PlacementSlot } from './itinerary-placement';
import { validDate } from '../utils/dates';

export type PlanSource = { kind: 'item' | 'place'; id: string };
export type PlannerSnapshot = { selectedTrip: Trip | null; canEdit: boolean; items: ItineraryItem[]; places: Place[]; bookings: Booking[] };
export type PlannerInput = Pick<ItineraryItem, 'day' | 'time' | 'title' | 'kind' | 'note' | 'details'>;
export type PreparedPlacement = { source: PlanSource; tripId: string; slot: PlacementSlot; input: PlannerInput; conflict: string; original?: ItineraryItem; place?: Place };
export type PlannerActions = {
  createItem: (input: PlannerInput) => string;
  updateItem: (id: string, input: PlannerInput) => void;
  deleteItem: (id: string) => void;
  updatePlace: (id: string, input: Omit<Place, 'id' | 'updatedAt'>) => void;
};
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const schedule = (item: PlannerInput) => ({ day: item.day, time: item.time, endDay: item.details?.endDay ?? '', endTime: item.details?.endTime ?? '', placement: item.details?.placement ?? null });
export const plannerSourceKey = (source: PlanSource) => `${source.kind}:${source.id}`;
export function plannerSourceTitle(s: PlannerSnapshot, source: PlanSource) {
  return source.kind === 'place' ? s.places.find(p => p.id === source.id)?.title : s.items.find(i => i.id === source.id)?.title;
}
function editable(s: PlannerSnapshot, expected: string) {
  if (!s.selectedTrip || s.selectedTrip.id !== expected) throw new Error('旅行が変更されました。もう一度予定を選んでください。');
  if (!s.canEdit || s.selectedTrip.role === 'viewer') throw new Error('この旅行は閲覧のみです。');
}
export function preparePlacement(s: PlannerSnapshot, expectedTripId: string, source: PlanSource, slot: PlacementSlot, overrideTime?: string): PreparedPlacement {
  editable(s, expectedTripId);
  if (!validDate(slot.day)) throw new Error('追加先の日付を確認してください。');
  const place = source.kind === 'place' ? s.places.find(p => p.id === source.id) : undefined;
  const original = source.kind === 'item' ? s.items.find(i => i.id === source.id) : undefined;
  if (source.kind === 'place' && !place || source.kind === 'item' && !original) throw new Error('この予定・場所は削除されています。');
  if (place?.itineraryItemId && s.items.some(i => i.id === place.itineraryItemId)) throw new Error('この場所は追加済みです。「しおりを見る」で確認してください。');
  if (original && itemDetails(original).category === 'transport') throw new Error('移動は日時の編集から調整してください。');
  const time = overrideTime ?? original?.time ?? '';
  if (!validPlanTime(time)) throw new Error('時刻は00:00〜23:59で入力してください。');
  const details = { ...(original ? itemDetails(original) : emptyItineraryDetails('sightseeing')) };
  // Preserve duration, rather than leaving an overnight end on the old date.
  if (original && details.endTime && original.time && (original.day !== slot.day || original.time !== time)) {
    if (!time) { details.endDay = ''; details.endTime = ''; }
    else {
      const duration = Date.parse(`${details.endDay || original.day}T${details.endTime}:00Z`) - Date.parse(`${original.day}T${original.time}:00Z`);
      const end = new Date(Date.parse(`${slot.day}T${time}:00Z`) + duration);
      if (!Number.isFinite(duration) || duration < 0 || !Number.isFinite(end.getTime())) throw new Error('終了日時を確認してから移動してください。');
      details.endDay = end.toISOString().slice(0, 10); details.endTime = end.toISOString().slice(11, 16);
    }
  }
  const p: ItineraryPlacement = { ...slot, time, sequence: nextPlacementSequence(s.items) };
  if (!parseItineraryPlacement(p)) throw new Error('配置先を選び直してください。');
  const timeline = itineraryTimeline(s.items, s.bookings, s.places).filter(e => e.day === slot.day && (!original || e.item?.id !== original.id));
  if (slot.beforeKey === `item-${original?.id}` || slot.afterKey === `item-${original?.id}`) throw new Error('同じ予定の前後には移動できません。');
  const index = placementIndex(timeline, slot);
  if (index < 0 || (!slot.beforeKey && !slot.afterKey && timeline.length)) throw new Error('配置先の予定が変更されました。置き直してください。');
  const target = timeline[index];
  if (target?.item?.details?.category === 'transport' && target.item.details.transport?.afterKey === timeline[index - 1]?.key) {
    throw new Error('この移動の後か、前の予定の前を選んでください。');
  }
  p.orderKey = placementOrderKey(timeline, index);
  details.placement = p;
  const input: PlannerInput = { title: original?.title ?? place!.title, kind: original?.kind ?? '予定', note: original?.note ?? '', day: slot.day, time, details };
  const invalid = itineraryDetailsError(input.day, time, details);
  if (invalid) throw new Error(invalid);
  return { source, tripId: expectedTripId, slot, input, conflict: placementTimeConflict(timeline, index, time), original, place };
}

type Undo = { tripId: string; itemId: string; before?: PlannerInput; after: PlannerInput; place?: Place; linkedStatus?: Place['status'] };
/** Uses existing local-first APIs; never restores an entire cache on Undo. */
export function createPlannerCommitter() {
  let pending: { prepared: PreparedPlacement; itemId: string } | undefined;
  let undo: Undo | undefined;
  let lastAdd: { items: ItineraryItem[]; placeId: string; itemId: string } | undefined;
  return {
    get hasPendingLink() { return Boolean(pending); },
    get canUndo() { return Boolean(undo) && !pending; },
    save(s: PlannerSnapshot, prepared: PreparedPlacement, actions: PlannerActions) {
      editable(s, prepared.tripId);
      if (prepared.conflict) throw new Error(prepared.conflict);
      if (pending && !same(prepared, pending.prepared)) throw new Error('先に作成済みの予定の紐づけを再試行してください。');
      if (prepared.original) {
        const live = s.items.find(i => i.id === prepared.original!.id);
        if (!live || itemDetails(live).category !== itemDetails(prepared.original).category || !same(schedule(live), schedule(prepared.original))) throw new Error('予定が変更されました。置き直してください。');
        const input = { ...live, day: prepared.input.day, time: prepared.input.time, details: { ...itemDetails(live), ...scheduleDetails(prepared.input) } };
        actions.updateItem(live.id, input);
        undo = { tripId: prepared.tripId, itemId: live.id, before: { ...live, details: { ...itemDetails(live) } }, after: input };
        return live.id;
      }
      const place = s.places.find(p => p.id === prepared.source.id);
      if (!place) throw new Error('この場所は削除されています。');
      if (lastAdd?.items === s.items && lastAdd.placeId === place.id) return lastAdd.itemId;
      if (pending && !s.items.some(i => i.id === pending!.itemId)) throw new Error('作成した予定が見つかりません。しおりを確認してください。');
      const linked = s.items.find(i => i.id === place.itineraryItemId);
      if (linked && linked.id !== pending?.itemId) throw new Error('この場所は追加済みです。');
      if (!pending) pending = { prepared, itemId: actions.createItem({ ...prepared.input, title: place.title }) };
      const itemId = pending.itemId;
      const status = place.status === 'visited' ? 'visited' : 'planned';
      actions.updatePlace(place.id, { ...place, itineraryItemId: itemId, status });
      undo = { tripId: prepared.tripId, itemId, after: { ...prepared.input, title: place.title }, place: { ...place }, linkedStatus: status };
      pending = undefined;
      lastAdd = { items: s.items, placeId: place.id, itemId };
      return itemId;
    },
    retry(s: PlannerSnapshot, actions: PlannerActions): string {
      if (!pending) throw new Error('再試行する予定はありません。');
      return this.save(s, pending.prepared, actions);
    },
    undo(s: PlannerSnapshot, actions: PlannerActions) {
      const entry = undo;
      if (!entry || pending) throw new Error('取り消せる操作はありません。');
      editable(s, entry.tripId);
      const live = s.items.find(i => i.id === entry.itemId);
      if (!live || !same(schedule(live), schedule(entry.after))) throw new Error('予定が変更されているため取り消せません。');
      if (entry.before) {
        actions.updateItem(entry.itemId, { ...live, day: entry.before.day, time: entry.before.time, details: { ...itemDetails(live), ...scheduleDetails(entry.before) } });
      } else {
        // Do not delete a newly created plan after someone edited its contents.
        const content = (i: PlannerInput) => [i.title, i.note, i.kind, i.details];
        const place = s.places.find(p => p.id === entry.place?.id);
        if (!place || place.itineraryItemId !== entry.itemId || !same(content(live), content(entry.after))
          || s.places.some(p => p.id !== place.id && p.itineraryItemId === entry.itemId)) throw new Error('予定・場所が変更されているため取り消せません。');
        actions.updatePlace(place.id, { ...place, itineraryItemId: entry.place?.itineraryItemId ?? null,
          status: place.status === entry.linkedStatus ? entry.place!.status : place.status });
        actions.deleteItem(entry.itemId);
      }
      undo = undefined; lastAdd = undefined;
    },
    clearUndo() { undo = undefined; },
  };
}
function scheduleDetails(item: PlannerInput) {
  return { endDay: item.details?.endDay ?? '', endTime: item.details?.endTime ?? '', placement: item.details?.placement ?? null };
}
