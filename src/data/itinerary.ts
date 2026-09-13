import type { ItineraryCategory, ItineraryDetails, ItineraryItem, TransportMode } from './types';

export const itineraryCategories: { value: ItineraryCategory; label: string; icon: string; ios: string }[] = [
  { value: 'sightseeing', label: '観光', icon: 'photo_camera', ios: 'camera' },
  { value: 'meal', label: '食事', icon: 'restaurant', ios: 'fork.knife' },
  { value: 'transport', label: '移動', icon: 'route', ios: 'point.topleft.down.to.point.bottomright.curvepath' },
  { value: 'shopping', label: '買い物', icon: 'shopping_bag', ios: 'bag' },
  { value: 'other', label: 'その他', icon: 'event_note', ios: 'calendar' },
];
export const transportModes: { value: TransportMode; label: string; icon: string; ios: string }[] = [
  { value: 'walk', label: '徒歩', icon: 'directions_walk', ios: 'figure.walk' },
  { value: 'train', label: '電車', icon: 'train', ios: 'train.side.front.car' },
  { value: 'bus', label: 'バス', icon: 'directions_bus', ios: 'bus' },
  { value: 'car', label: '車', icon: 'directions_car', ios: 'car' },
  { value: 'taxi', label: 'タクシー', icon: 'local_taxi', ios: 'car.side' },
  { value: 'flight', label: '飛行機', icon: 'flight', ios: 'airplane' },
  { value: 'boat', label: '船', icon: 'directions_boat', ios: 'ferry' },
  { value: 'other', label: 'その他', icon: 'more_horiz', ios: 'ellipsis' },
];
export const emptyItineraryDetails = (category: ItineraryCategory = 'other'): ItineraryDetails => ({ category, location: '', endDay: '', endTime: '' });
export function itemDetails(item: ItineraryItem): ItineraryDetails {
  return item.details ?? emptyItineraryDetails(itineraryCategories.find((category) => category.label === item.kind)?.value ?? 'other');
}
export function itemCategory(item: ItineraryItem) {
  return itineraryCategories.find((category) => category.value === itemDetails(item).category) ?? itineraryCategories[4];
}
export function durationMinutes(day: string, time: string, details: ItineraryDetails) {
  if (time && details.endTime) {
    const minutes = (Date.parse(`${details.endDay || day}T${details.endTime}:00Z`) - Date.parse(`${day}T${time}:00Z`)) / 60000;
    return Number.isFinite(minutes) && minutes >= 0 ? minutes : undefined;
  }
  return details.category === 'transport' ? details.transport?.durationMinutes : undefined;
}
export function durationLabel(minutes?: number) {
  if (minutes === undefined) return '';
  return `${minutes >= 60 ? `${Math.floor(minutes / 60)}時間` : ''}${minutes % 60 || minutes === 0 ? `${minutes % 60}分` : ''}`;
}
export function itemEndLabel(item: ItineraryItem) {
  const details = itemDetails(item);
  return details.endTime ? `${details.endDay && details.endDay !== item.day ? `${details.endDay.slice(5).replace('-', '/')} ` : ''}${details.endTime}` : '';
}
export function transportLabel(details: ItineraryDetails) {
  return transportModes.find((mode) => mode.value === details.transport?.mode)?.label ?? '移動';
}
export function itineraryDetailsError(day: string, time: string, details: ItineraryDetails) {
  if (details.endTime && !time) return '終了・到着時刻を指定する場合は、開始・出発時刻も入力してください';
  if (details.endTime && durationMinutes(day, time, details) === undefined) return '終了・到着日時は開始・出発日時以降にしてください';
  if (details.category === 'transport' && details.transport?.durationMinutes !== undefined && (!Number.isInteger(details.transport.durationMinutes) || details.transport.durationMinutes < 1 || details.transport.durationMinutes > 10080)) return '所要時間は1〜10080分で入力してください';
  return '';
}

// Keep an untimed transfer beside its preceding event. If that event is removed
// or moved to another day, the normal chronological order remains the fallback.
export function orderItineraryEntries<T extends { key: string; day: string; time: string; item?: ItineraryItem }>(entries: T[]): T[] {
  const sorted = [...entries].sort((left, right) => left.day.localeCompare(right.day) || (left.time || '99:99').localeCompare(right.time || '99:99') || Number(Boolean(left.item && itemDetails(left.item).category === 'transport')) - Number(Boolean(right.item && itemDetails(right.item).category === 'transport')) || left.key.localeCompare(right.key));
  for (const entry of [...sorted]) {
    const details = entry.item && itemDetails(entry.item);
    if (details?.category !== 'transport' || !details.transport?.afterKey) continue;
    const anchor = sorted.find((candidate) => candidate.key === details.transport?.afterKey);
    if (!anchor || anchor.day !== entry.day || (anchor.item && itemDetails(anchor.item).category === 'transport') || (entry.time && entry.time !== anchor.time)) continue;
    sorted.splice(sorted.indexOf(entry), 1);
    sorted.splice(sorted.indexOf(anchor) + 1, 0, entry);
  }
  return sorted;
}
