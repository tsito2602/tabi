import { captureDetailOrigin, type DetailOrigin } from '@/utils/detail-origin';
import { MotionPresence } from '@/components/motion-presence';
import { usePalette, useThemedStyles } from '@/theme/theme-provider';
import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { ItineraryCategoryPicker } from '@/components/itinerary-fields';
import { emptyItineraryDetails } from '@/data/itinerary';
import { PlaceStatusIcon } from '@/components/place-status-icon';
import { FormSheet } from '@/components/form-sheet';
import { FloatingAddButton } from '@/components/floating-add-button';
import { mono, type Palette } from '@/constants/design';
import { useTravel } from '@/data/travel-provider';
import type { ItineraryCategory, Place, PlaceStatus } from '@/data/types';
import { mapUrl, placeStatuses, reservationStatuses } from '@/data/places';
import { PlaceSheet } from '@/components/place-sheet';
import { DateRangePicker } from '@/components/date-range-picker';
import { useToast } from '@/components/toast';
import { useTripHeaderHeight } from '@/components/trip-header-context';

export default function PlacesScreen() {
  const [detailOrigin, setDetailOrigin] = useState<DetailOrigin>();
  const palette = usePalette();
  const styles = useThemedStyles(createStyles);

  const { canEdit, places, items, updatePlace, selectedTrip, createItem } = useTravel();
  const toast = useToast();
  const router = useRouter();
  const headerHeight = useTripHeaderHeight();
  const [filter, setFilter] = useState<PlaceStatus | 'all'>('all');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Place | 'new' | null>(null);
  const [statusPlace, setStatusPlace] = useState<Place | null>(null);
  const [planning, setPlanning] = useState<Place | null>(null);
  const [day, setDay] = useState('');
  const [category, setCategory] = useState<ItineraryCategory>('sightseeing');
  const filtered = useMemo(() => places.filter((place) => (filter === 'all' || place.status === filter) && `${place.title} ${place.note} ${place.location}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())), [places, filter, search]);
  const open = (place?: Place) => { if (!place) setDetailOrigin(undefined); setEditing(place ?? 'new'); };
  const plan = () => {
    if (!planning || !day || !canEdit) return;
    if (items.some((item) => item.id === planning.itineraryItemId)) { setPlanning(null); return; }
    const itineraryItemId = createItem({ title: planning.title, day, time: '', kind: '予定', note: '', details: emptyItineraryDetails(category) });
    updatePlace(planning.id, { ...planning, itineraryItemId, status: planning.status === 'visited' ? 'visited' : 'planned' });
    toast('しおりに追加しました'); setPlanning(null);
  };
  return <View style={styles.screen}>
    <ScrollView testID="places-scroll" contentContainerStyle={[styles.content, { paddingTop: headerHeight + 24 }]} showsVerticalScrollIndicator={false}>
      {places.length ? <TextInput value={search} onChangeText={setSearch} placeholder="場所を検索" accessibilityLabel="場所を検索" placeholderTextColor={palette.placeholder} style={styles.search} /> : null}
      {places.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
        {[{ value: 'all' as const, label: 'すべて' }, ...placeStatuses].map((item) => <Pressable accessibilityRole="button" key={item.value} onPress={() => setFilter(item.value)} style={[styles.filter, filter === item.value && styles.filterSelected]}>{item.value !== 'all' ? <PlaceStatusIcon status={item.value} size={16} /> : null}<Text style={[styles.filterText, filter === item.value && styles.filterTextSelected]}>{item.label} {item.value === 'all' ? places.length : places.filter((place) => place.status === item.value).length}</Text></Pressable>)}
      </ScrollView> : null}
      {!places.length ? <View style={styles.empty}><View style={styles.emptyPlaceMark} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><SymbolView name={{ ios: 'mappin.and.ellipse', android: 'location_on', web: 'location_on' }} size={46} tintColor={palette.ocean} /><View style={styles.emptyPlaceAdd}><SymbolView name={{ ios: 'plus', android: 'add', web: 'add' }} size={18} tintColor={palette.onOcean} /></View></View><Text style={styles.emptyTitle}>気になる場所を保存</Text><Pressable accessibilityRole="button" disabled={!canEdit} onPress={() => open()} style={styles.primary}><Text style={styles.primaryText}>＋ 場所を追加</Text></Pressable></View> : !filtered.length ? <View style={styles.empty}><Text style={styles.emptyTitle}>該当する場所がありません</Text><Pressable accessibilityRole="button" onPress={() => { setFilter('all'); setSearch(''); }} style={styles.primary}><Text style={styles.primaryText}>絞り込みを解除</Text></Pressable></View> : <View testID="place-grid" style={{ gap: 16 }}>{filtered.map((place, index) => {
        const itineraryItem = items.find((item) => item.id === place.itineraryItemId);
        const status = placeStatuses.find((entry) => entry.value === place.status)!;
        const reservation = reservationStatuses.find((entry) => entry.value === place.reservationStatus)!;
        return <View key={place.id} testID="place-card" style={[styles.card, place.status === 'visited' && styles.visited]}>
          <Pressable accessibilityRole="button" onPress={(event) => { setDetailOrigin(captureDetailOrigin(event)); open(place); }} style={styles.cardBody} accessibilityLabel={`${place.title}の詳細を開く`}>
            <View style={styles.cardTop}><Text style={styles.serial}>SPOT / {String(index + 1).padStart(2, '0')}</Text><Text style={[styles.reservation, place.reservationStatus === 'needed' && styles.needed]}>{reservation.label}</Text></View>
            <Text testID="detail-source-title" style={styles.placeTitle}>{place.title}</Text>
            {place.note ? <Text numberOfLines={3} style={styles.note}>{place.note}</Text> : null}
            {place.openingHours ? <Text style={styles.hours}>◷　{place.openingHours}</Text> : null}
            {place.location ? <Text numberOfLines={1} style={styles.location}>{/^https?:/i.test(place.location) ? '地図リンクを保存済み' : place.location}</Text> : null}
          </Pressable>
          <View style={styles.cardFooter}>
            <Pressable accessibilityRole="button" accessibilityLabel={`${place.title}のステータスを変更`} disabled={!canEdit} onPress={() => setStatusPlace(place)} style={[styles.status, place.status === 'visited' && styles.statusVisited]}><PlaceStatusIcon status={place.status} /><Text style={styles.statusText}>{status.label}</Text></Pressable>
            <View style={styles.cardActions}>{itineraryItem || canEdit ? <Pressable accessibilityRole="button" onPress={() => {
              if (itineraryItem && selectedTrip) {
                router.push({ pathname: '/trips/[tripId]/itinerary', params: { tripId: selectedTrip.id, itemId: itineraryItem.id } });
              } else { setDay(selectedTrip?.startsOn ?? ''); setCategory('sightseeing'); setPlanning(place); }
            }} style={styles.action}><SymbolView name={itineraryItem ? { ios: 'book', android: 'menu_book', web: 'menu_book' } : { ios: 'calendar.badge.plus', android: 'event', web: 'event' }} size={16} tintColor={palette.ocean} /><Text style={styles.actionText}>{itineraryItem ? 'しおりを見る' : 'しおりへ'}</Text></Pressable> : null}<Pressable accessibilityRole="button" accessibilityLabel={`${place.title}の地図を開く`} onPress={() => { const url = mapUrl(place.location, place.title); if (url) void Linking.openURL(url); }} style={styles.action}><SymbolView name={{ ios: 'map', android: 'map', web: 'map' }} size={16} tintColor={palette.ocean} /><Text style={styles.actionText}>地図</Text></Pressable></View>
          </View>
        </View>;
      })}</View>}
    </ScrollView>
    {canEdit ? <FloatingAddButton label="場所を追加" onPress={() => open()} /> : null}
    <MotionPresence>{editing ? <PlaceSheet detailOrigin={detailOrigin} key={editing === 'new' ? 'new' : editing.id} place={editing === 'new' ? undefined : places.find((place) => place.id === editing.id) ?? editing} onClose={() => setEditing(null)} onPlan={canEdit || (editing !== 'new' && items.some((item) => item.id === editing.itineraryItemId)) ? (place) => {
      setEditing(null);
      const item = items.find((entry) => entry.id === place.itineraryItemId);
      if (item && selectedTrip) router.push({ pathname: '/trips/[tripId]/itinerary', params: { tripId: selectedTrip.id, itemId: item.id } });
      else { setDay(selectedTrip?.startsOn ?? ''); setCategory('sightseeing'); setPlanning(place); }
    } : undefined} /> : null}</MotionPresence>
    <MotionPresence>{statusPlace ? <FormSheet visible title="ステータスを変更" onClose={() => setStatusPlace(null)}><Text style={styles.placeTitle}>{statusPlace.title}</Text>{placeStatuses.map((entry) => <Pressable accessibilityRole="button" key={entry.value} disabled={!canEdit} onPress={() => { updatePlace(statusPlace.id, { ...statusPlace, status: entry.value }); setStatusPlace(null); }} style={[styles.option, statusPlace.status === entry.value && styles.filterSelected]}><PlaceStatusIcon status={entry.value} /><Text style={styles.optionText}>{entry.label}{statusPlace.status === entry.value ? '　✓' : ''}</Text></Pressable>)}</FormSheet> : null}</MotionPresence>
    <MotionPresence>{planning ? <FormSheet visible title="しおりに追加" onClose={() => setPlanning(null)} onSave={canEdit ? plan : undefined} saveLabel="追加" canSave={Boolean(day)}><Text style={styles.placeTitle}>{planning.title}</Text><ItineraryCategoryPicker linkedPlace value={category} onChange={setCategory} /><DateRangePicker mode="single" startDate={day} endDate={day} label="訪問日" onChange={(range) => setDay(range.startDate)} /></FormSheet> : null}</MotionPresence>
  </View>;
}
const createStyles = (palette: Palette) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.canvas },
  content: { width: '100%', maxWidth: 800, alignSelf: 'center', paddingHorizontal: 20, paddingBottom: 110, gap: 16 },
  search: { minHeight: 48, backgroundColor: palette.paper, borderRadius: 12, paddingHorizontal: 16, fontSize: 15, color: palette.ink },
  filters: { gap: 6 },
  filter: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 24, paddingHorizontal: 14, paddingVertical: 11, backgroundColor: palette.mist },
  filterSelected: { backgroundColor: palette.sky },
  filterText: { color: palette.slate, fontSize: 12 },
  filterTextSelected: { color: palette.ink, fontWeight: '700' },
  card: { borderRadius: 20, backgroundColor: palette.paper, overflow: 'hidden' },
  visited: { backgroundColor: palette.successSurface },
  cardBody: { padding: 20, gap: 10 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  serial: { color: palette.smoke, fontFamily: mono, fontSize: 10, letterSpacing: 1 },
  reservation: { color: palette.ocean, fontSize: 11 },
  needed: { color: palette.warning },
  placeTitle: { color: palette.ink, fontSize: 21, lineHeight: 29, fontWeight: '700' },
  note: { color: palette.slate, fontSize: 14, lineHeight: 23 },
  hours: { color: palette.slate, fontSize: 12, lineHeight: 20, marginTop: 4 },
  location: { color: palette.smoke, fontSize: 12 },
  cardFooter: { padding: 12, paddingHorizontal: 16, borderTopWidth: 1, borderStyle: 'dashed', borderColor: palette.ash, flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between' },
  status: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, minHeight: 36, justifyContent: 'center', backgroundColor: palette.soft, borderRadius: 20 },
  statusVisited: { backgroundColor: palette.success },
  statusText: { color: palette.ink, fontSize: 12, fontWeight: '600' },
  cardActions: { flexDirection: 'row', gap: 8 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 6, minHeight: 36, justifyContent: 'center' },
  actionText: { color: palette.ocean, fontSize: 12, fontWeight: '600' },
  empty: { paddingVertical: 60, alignItems: 'center', gap: 24 },
  emptyPlaceMark: { width: 96, height: 96, borderRadius: 48, backgroundColor: palette.sky, alignItems: 'center', justifyContent: 'center' },
  emptyPlaceAdd: { position: 'absolute', right: 0, bottom: 0, width: 30, height: 30, borderRadius: 15, backgroundColor: palette.ocean, borderWidth: 3, borderColor: palette.canvas, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { color: palette.slate, fontSize: 18, fontWeight: '600' },
  primary: { paddingHorizontal: 20, paddingVertical: 15, backgroundColor: palette.ocean, borderRadius: 12 },
  primaryText: { color: palette.onOcean, fontSize: 14, fontWeight: '700' },
  option: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, backgroundColor: palette.paper, borderRadius: 10 },
  optionText: { color: palette.ink, fontSize: 13 },
});
