import { useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { DateRangePicker } from '@/components/date-range-picker';
import { FormSheet } from '@/components/form-sheet';
import { ItineraryCategoryPicker } from '@/components/itinerary-fields';
import { useTravel } from '@/data/travel-provider';
import { itineraryTimeline } from '@/data/itinerary-timeline';
import { createPlacePlanCommitter, placePlanError, placePlanInput, type PlacePlan } from '@/data/place-plan';
import { useThemedStyles } from '@/theme/theme-provider';
import { mono, type Palette } from '@/constants/design';
import type { DetailOrigin } from '@/utils/detail-origin';
import { formatDate, validDate } from '@/utils/dates';

export function PlacePlanSheet({ placeId, detailOrigin, onClose, onComplete }: {
  placeId: string;
  detailOrigin?: DetailOrigin;
  onClose: () => void;
  onComplete: (tripId: string, itemId: string, inserted: boolean) => void;
}) {
  const styles = useThemedStyles(createStyles);
  const { selectedTrip, places, items, bookings, canEdit, createItem, updatePlace } = useTravel();
  const [tripId] = useState(() => selectedTrip?.id ?? '');
  const [initial] = useState<PlacePlan>(() => ({ day: selectedTrip?.startsOn ?? '', time: '', category: 'sightseeing' }));
  const [plan, setPlan] = useState<PlacePlan>(initial);
  const [error, setError] = useState('');
  const saving = useRef(false);
  const committer = useRef(createPlacePlanCommitter());
  const [createdId, setCreatedId] = useState<string>();
  const linkPending = Boolean(createdId);
  const place = places.find((entry) => entry.id === placeId);
  const linked = items.find((item) => item.id === place?.itineraryItemId);
  const previewDay = linked?.day ?? plan.day;
  const validation = placePlanError(place, selectedTrip, tripId, plan, canEdit);
  const preview = useMemo(() => {
    if (!place || !validDate(previewDay)) return [];
    const existing = itineraryTimeline(items, bookings, places).filter((entry) => entry.day === previewDay);
    if (linked) return existing;
    const draft = { id: createdId ?? 'place-plan-preview', ...placePlanInput(place, plan) };
    return itineraryTimeline([...items.filter((item) => item.id !== draft.id), draft], bookings, places)
      .filter((entry) => entry.day === previewDay);
  }, [place, plan, items, bookings, places, linked, createdId, previewDay]);
  const outsideTrip = !linked && selectedTrip && validDate(plan.day) && (plan.day < selectedTrip.startsOn || plan.day > selectedTrip.endsOn);
  const changed = JSON.stringify(plan) !== JSON.stringify(initial);
  const save = () => {
    if (saving.current) return;
    if (selectedTrip?.id !== tripId || !place) { setError(validation); return; }
    saving.current = true;
    try {
      const result = committer.current.save({ trip: selectedTrip, expectedTripId: tripId, place, items, canEdit }, plan, { createItem, updatePlace });
      onComplete(tripId, result.itemId, result.inserted);
    } catch (cause) {
      saving.current = false;
      setCreatedId(committer.current.pendingItemId);
      setError(cause instanceof Error ? cause.message : '追加できませんでした。もう一度お試しください。');
    }
  };
  const disabled = Boolean(linked || linkPending || !canEdit || !place || selectedTrip?.id !== tripId);
  return <FormSheet detailOrigin={detailOrigin} visible title="しおりに追加" onClose={onClose}
    onSave={save} saveLabel={linked ? 'しおりを見る' : linkPending ? '再試行' : '追加'}
    canSave={Boolean(place && selectedTrip?.id === tripId && (linked || !validation))}
    dirty={!linked && (changed || linkPending)} error={error || (!place || selectedTrip?.id !== tripId || (!canEdit && !linked) ? validation : undefined)}>
    <View testID="place-plan-heading" style={styles.heading}>
      <Text style={styles.title}>{place?.title ?? '行きたい場所'}</Text>
      <Text style={styles.caption}>行きたい場所にも残ります</Text>
    </View>
    {linked ? <Text accessibilityLiveRegion="polite" style={styles.caption}>追加済み · {formatDate(linked.day)} {linked.time || '時刻未定'}</Text> : <>
      <DateRangePicker mode="single" showTime disabled={disabled} label="追加先の日時" startDate={plan.day} endDate={plan.day} startTime={plan.time}
        onChange={(range) => { setError(''); setPlan((current) => ({ ...current, day: range.startDate, time: range.startTime })); }} />
      {!disabled ? <ItineraryCategoryPicker linkedPlace value={plan.category} onChange={(category) => {
        if (category !== 'transport') setPlan((current) => ({ ...current, category }));
      }} /> : null}
    </>}
    {outsideTrip ? <Text style={styles.warning}>旅行期間外の日付です。しおりにはこの日付で追加されます。</Text> : null}
    {linkPending && !linked ? <Text style={styles.warning}>予定は作成済みです。「再試行」で場所との紐づけを保存します。</Text> : null}
    {selectedTrip?.id === tripId && validDate(previewDay) ? <View testID="place-plan-preview" style={styles.preview}>
      <Text accessibilityRole="header" accessibilityLiveRegion="polite" style={styles.date}>{formatDate(previewDay, true)}のしおり</Text>
      {preview.length === 1 && !linked ? <Text style={styles.empty}>この日はまだ予定がありません</Text> : null}
      {preview.map((entry) => {
        const candidate = !linked && entry.item?.id === (createdId ?? 'place-plan-preview');
        return <View key={entry.key} testID={candidate ? 'place-plan-candidate' : 'place-plan-existing'} style={[styles.row, candidate && styles.candidate]}>
          <Text style={styles.time}>{entry.time || '時刻未定'}</Text>
          <View style={styles.copy}>
            <Text style={styles.rowTitle}>{entry.title}</Text>
            <Text style={styles.caption}>{candidate ? '追加する予定' : entry.bookingStage ?? '予定'}</Text>
          </View>
        </View>;
      })}
      {plan.time && !linked && preview.some((entry) => entry.time === plan.time && entry.item?.id !== (createdId ?? 'place-plan-preview')) ? <Text style={styles.caption}>同じ時刻の予定があります。</Text> : null}
      {!plan.time && !linked ? <Text style={styles.caption}>時刻未定の予定は、その日の時刻が決まった予定の後に並びます。</Text> : null}
    </View> : null}
  </FormSheet>;
}

const createStyles = (palette: Palette) => StyleSheet.create({
  heading: { gap: 6, marginBottom: 8 },
  title: { color: palette.ink, fontSize: 23, lineHeight: 31, fontWeight: '700' },
  caption: { color: palette.slate, fontSize: 12, lineHeight: 19 },
  warning: { color: palette.warning, fontSize: 13, lineHeight: 21 },
  preview: { gap: 10, marginTop: 18 },
  date: { color: palette.ink, fontSize: 15, lineHeight: 23, fontWeight: '700' },
  empty: { color: palette.smoke, fontSize: 13, lineHeight: 20 },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 72, padding: 12, gap: 12, borderRadius: 14, backgroundColor: palette.paper },
  candidate: { backgroundColor: palette.sky, borderWidth: 1, borderColor: palette.ocean, borderStyle: 'dashed' },
  time: { color: palette.ocean, fontFamily: mono, fontSize: 11, width: 58, flexShrink: 0 },
  copy: { flex: 1, minWidth: 0, gap: 4 },
  rowTitle: { color: palette.ink, fontSize: 15, lineHeight: 22, fontWeight: '600' },
});
