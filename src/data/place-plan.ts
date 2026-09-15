import type { ItineraryCategory, ItineraryItem, Place, Trip } from './types';
import { emptyItineraryDetails } from './itinerary';
import { validDate } from '../utils/dates';

export type PlacePlan = { day: string; time: string; category: Exclude<ItineraryCategory, 'transport'> };
export function placePlanError(place: Place | undefined, trip: Trip | null, expectedTripId: string, plan: PlacePlan, canEdit: boolean) {
  if (!trip || trip.id !== expectedTripId) return '旅行が変更されました。閉じて、追加先の旅行から開き直してください。';
  if (!place) return 'この場所は削除されています。閉じて一覧を確認してください。';
  if (!canEdit) return 'この旅行は閲覧のみです。';
  if (!validDate(plan.day)) return '追加先の日付を選択してください。';
  if (plan.time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(plan.time)) return '時刻は00:00〜23:59で入力してください。';
  if (!['sightseeing', 'meal', 'shopping', 'other'].includes(plan.category)) return '予定のカテゴリを選択してください。';
  return '';
}
export function placePlanInput(place: Place, plan: PlacePlan): Omit<ItineraryItem, 'id'> {
  return { title: place.title, day: plan.day, time: plan.time, kind: '予定', note: '', details: emptyItineraryDetails(plan.category) };
}

// Reuse the existing local-first mutations. A synchronous save latch protects
// against repeat taps, and a failed link retry reuses the already-created item.
export function createPlacePlanCommitter() {
  let pending: { itemId: string; plan: PlacePlan } | undefined;
  let result: { itemId: string; inserted: boolean } | undefined;
  return {
    get pendingItemId() { return pending?.itemId; },
    save(context: { trip: Trip | null; expectedTripId: string; place?: Place; items: ItineraryItem[]; canEdit: boolean }, plan: PlacePlan,
      actions: { createItem: (input: ReturnType<typeof placePlanInput>) => string; updatePlace: (id: string, input: Omit<Place, 'id' | 'updatedAt'>) => void }) {
      const { trip, expectedTripId, place, items, canEdit } = context;
      if (!trip || trip.id !== expectedTripId || !place) throw new Error(placePlanError(place, trip, expectedTripId, plan, canEdit));
      if (result) return result;
      const existing = items.find((item) => item.id === place.itineraryItemId);
      if (existing) return (result = { itemId: existing.id, inserted: false });
      const error = placePlanError(place, trip, expectedTripId, plan, canEdit);
      if (error) throw new Error(error);
      if (!pending) pending = { itemId: actions.createItem(placePlanInput(place, plan)), plan: { ...plan } };
      if (JSON.stringify(plan) !== JSON.stringify(pending.plan)) throw new Error('作成済みの日時を変えずに、紐づけを再試行してください。');
      actions.updatePlace(place.id, { ...place, itineraryItemId: pending.itemId, status: place.status === 'visited' ? 'visited' : 'planned' });
      result = { itemId: pending.itemId, inserted: true };
      return result;
    },
  };
}
