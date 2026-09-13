import { usePalette, useThemedStyles } from '@/theme/theme-provider';
import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { PlaceStatusIcon } from '@/components/place-status-icon';
import { FormSheet } from '@/components/form-sheet';
import { FloatingAddButton } from '@/components/floating-add-button';
import { mono, type Palette } from '@/constants/design';
import { useTravel } from '@/data/travel-provider';
import type { Place, PlaceInput, PlaceStatus } from '@/data/types';
import { mapUrl, referenceUrl, placeStatuses, reservationStatuses } from '@/data/places';
import { confirmDeletion } from '@/utils/confirm-deletion';
import { DateRangePicker } from '@/components/date-range-picker';
import { useToast } from '@/components/toast';
import { useTripHeaderHeight } from '@/components/trip-header-context';

const empty: PlaceInput = { title: '', note: '', openingHours: '', reservationStatus: 'not_needed', location: '', referenceLinks: [], status: 'want' };
export default function PlacesScreen() {
  const palette = usePalette();
  const styles = useThemedStyles(createStyles);

  const { canEdit, places, items, createPlace, updatePlace, deletePlace, selectedTrip, createItem } = useTravel();
  const toast = useToast();
  const router = useRouter();
  const headerHeight = useTripHeaderHeight();
  const [filter, setFilter] = useState<PlaceStatus | 'all'>('all');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Place | 'new' | null>(null);
  const [viewing, setViewing] = useState(false);
  const [draft, setDraft] = useState<PlaceInput>(empty);
  const [initial, setInitial] = useState('');
  const [error, setError] = useState('');
  const [statusPlace, setStatusPlace] = useState<Place | null>(null);
  const [planning, setPlanning] = useState<Place | null>(null);
  const [day, setDay] = useState('');
  const filtered = useMemo(() => places.filter((place) => (filter === 'all' || place.status === filter) && `${place.title} ${place.note} ${place.location}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())), [places, filter, search]);
  const open = (place?: Place) => { const value = place ? { ...place, referenceLinks: place.referenceLinks ?? [] } : empty; setDraft(value); setInitial(JSON.stringify(value)); setError(''); setEditing(place ?? 'new'); setViewing(Boolean(place)); };
  const save = () => {
    if (!draft.title.trim()) return setError('タイトルを入力してください');
    if (draft.location.trim() && !mapUrl(draft.location)) return setError('場所は住所か、http / httpsのURLを入力してください');
    const referenceLinks = (draft.referenceLinks ?? []).map((link) => ({ label: link.label.trim(), url: link.url.trim() })).filter((link) => link.label || link.url);
    if (referenceLinks.some((link) => !referenceUrl(link.url))) return setError('参照リンクはhttp / httpsのURLを入力してください');
    const input = { ...draft, title: draft.title.trim(), location: draft.location.trim(), referenceLinks };
    if (!canEdit) return;
    const id = editing && editing !== 'new' ? editing.id : createPlace(input);
    if (editing && editing !== 'new') updatePlace(id, input);
    setEditing({ id, ...input }); setDraft(input); setInitial(JSON.stringify(input)); setError('');
    setViewing(true); toast('場所を保存しました');
  };
  const remove = () => { if (!editing || editing === 'new') return; confirmDeletion('この場所を削除しますか？', editing.title, () => { deletePlace(editing.id); setEditing(null); }); };
  const plan = () => {
    if (!planning || !day || !canEdit) return;
    if (items.some((item) => item.id === planning.itineraryItemId)) { setPlanning(null); return; }
    const itineraryItemId = createItem({ title: planning.title, day, time: '', kind: '予定', note: [planning.note, planning.location].filter(Boolean).join('\n') });
    updatePlace(planning.id, { ...planning, itineraryItemId, status: planning.status === 'want' ? 'planned' : planning.status });
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
          <Pressable accessibilityRole="button" onPress={() => open(place)} style={styles.cardBody} accessibilityLabel={`${place.title}の詳細を開く`}>
            <View style={styles.cardTop}><Text style={styles.serial}>SPOT / {String(index + 1).padStart(2, '0')}</Text><Text style={[styles.reservation, place.reservationStatus === 'needed' && styles.needed]}>{reservation.label}</Text></View>
            <Text style={styles.placeTitle}>{place.title}</Text>
            {place.note ? <Text numberOfLines={3} style={styles.note}>{place.note}</Text> : null}
            {place.openingHours ? <Text style={styles.hours}>◷　{place.openingHours}</Text> : null}
            {place.location ? <Text numberOfLines={1} style={styles.location}>{/^https?:/i.test(place.location) ? '地図リンクを保存済み' : place.location}</Text> : null}
          </Pressable>
          <View style={styles.cardFooter}>
            <Pressable accessibilityRole="button" accessibilityLabel={`${place.title}のステータスを変更`} disabled={!canEdit} onPress={() => setStatusPlace(place)} style={[styles.status, place.status === 'visited' && styles.statusVisited]}><PlaceStatusIcon status={place.status} /><Text style={styles.statusText}>{status.label}</Text></Pressable>
            <View style={styles.cardActions}>{itineraryItem || canEdit ? <Pressable accessibilityRole="button" onPress={() => {
              if (itineraryItem && selectedTrip) {
                router.push({ pathname: '/trips/[tripId]/itinerary', params: { tripId: selectedTrip.id, itemId: itineraryItem.id } });
              } else { setDay(selectedTrip?.startsOn ?? ''); setPlanning(place); }
            }} style={styles.action}><SymbolView name={itineraryItem ? { ios: 'book', android: 'menu_book', web: 'menu_book' } : { ios: 'calendar.badge.plus', android: 'event', web: 'event' }} size={16} tintColor={palette.ocean} /><Text style={styles.actionText}>{itineraryItem ? 'しおりを見る' : 'しおりへ'}</Text></Pressable> : null}<Pressable accessibilityRole="button" accessibilityLabel={`${place.title}の地図を開く`} onPress={() => { const url = mapUrl(place.location, place.title); if (url) void Linking.openURL(url); }} style={styles.action}><SymbolView name={{ ios: 'map', android: 'map', web: 'map' }} size={16} tintColor={palette.ocean} /><Text style={styles.actionText}>地図</Text></Pressable></View>
          </View>
        </View>;
      })}</View>}
    </ScrollView>
    {canEdit ? <FloatingAddButton label="場所を追加" onPress={() => open()} /> : null}
    {editing ? <FormSheet visible presentation={viewing ? 'detail' : 'form'} title={viewing ? '場所の詳細' : editing === 'new' ? '場所を追加' : '場所を編集'} onClose={() => setEditing(null)} onSave={canEdit ? viewing ? () => setViewing(false) : save : undefined} saveLabel={viewing ? '編集' : '保存'} canSave={viewing || Boolean(draft.title.trim())} dirty={!viewing && JSON.stringify(draft) !== initial} error={error}>
      {viewing ? <View testID="place-details" style={styles.details}>
        <Text accessibilityRole="header" selectable style={styles.detailTitle}>{draft.title}</Text>
        {editing !== 'new' && (canEdit || items.some((item) => item.id === draft.itineraryItemId)) ? <Pressable accessibilityRole="button" style={styles.mapButton} onPress={() => {
          const item = items.find((entry) => entry.id === draft.itineraryItemId);
          setEditing(null);
          if (item && selectedTrip) router.push({ pathname: '/trips/[tripId]/itinerary', params: { tripId: selectedTrip.id, itemId: item.id } });
          else { setDay(selectedTrip?.startsOn ?? ''); setPlanning(places.find((entry) => entry.id === editing.id) ?? editing); }
        }}><Text style={styles.actionText}>{items.some((item) => item.id === draft.itineraryItemId) ? 'しおりを見る' : 'しおりへ'}</Text></Pressable> : null}
        <View style={styles.detailStatus}><PlaceStatusIcon status={draft.status} size={20} /><Text style={styles.statusText}>{placeStatuses.find((item) => item.value === draft.status)?.label}</Text></View>
        {draft.location ? <View style={styles.detailSection}><Text style={styles.detailLabel}>場所</Text><Text selectable style={styles.detailValue}>{draft.location}</Text></View> : null}
        <Pressable accessibilityRole="button" accessibilityLabel={`${draft.title}の地図を開く`} onPress={() => { const url = mapUrl(draft.location, draft.title); if (url) void Linking.openURL(url); }} style={styles.mapButton}><SymbolView name={{ ios: 'map', android: 'map', web: 'map' }} size={20} tintColor={palette.ocean} /><Text style={styles.actionText}>地図を開く</Text></Pressable>
        {draft.referenceLinks?.length ? <View style={styles.detailSection}><Text style={styles.detailLabel}>参照リンク</Text>{draft.referenceLinks.map((link, index) => {
          const url = referenceUrl(link.url);
          return url ? <Pressable key={index} accessibilityRole="link" accessibilityLabel={`${link.label || new URL(url).hostname}を開く`} onPress={() => { void Linking.openURL(url).catch(() => toast('リンクを開けませんでした')); }} style={styles.referenceButton}>
            <SymbolView name={{ ios: 'link', android: 'link', web: 'link' }} size={20} tintColor={palette.ocean} />
            <View style={styles.referenceCopy}><Text style={styles.referenceTitle}>{link.label || new URL(url).hostname}</Text><Text numberOfLines={1} style={styles.referenceUrl}>{url}</Text></View>
          </Pressable> : null;
        })}</View> : null}
        {draft.openingHours ? <View style={styles.detailSection}><Text style={styles.detailLabel}>営業時間</Text><Text selectable style={styles.detailValue}>{draft.openingHours}</Text></View> : null}
        <View style={styles.detailSection}><Text style={styles.detailLabel}>予約状況</Text><Text style={[styles.detailValue, draft.reservationStatus === 'needed' && styles.needed]}>{reservationStatuses.find((item) => item.value === draft.reservationStatus)?.label}</Text></View>
        {draft.note ? <View style={styles.detailSection}><Text style={styles.detailLabel}>メモ</Text><Text selectable style={styles.detailValue}>{draft.note}</Text></View> : null}
      </View> : <>
      <Text style={styles.label}>タイトル</Text><TextInput editable={canEdit} autoFocus={canEdit} accessibilityLabel="場所のタイトル" value={draft.title} onChangeText={(title) => setDraft({ ...draft, title })} maxLength={160} placeholder="カフェ、美術館、気になるお店" placeholderTextColor={palette.placeholder} style={styles.input} />
      <Text style={styles.label}>ステータス</Text><View style={styles.options}>{placeStatuses.map((item) => <Pressable accessibilityRole="button" key={item.value} disabled={!canEdit} onPress={() => setDraft({ ...draft, status: item.value })} style={[styles.option, draft.status === item.value && styles.filterSelected]}><PlaceStatusIcon status={item.value} /><Text style={styles.optionText}>{item.label}</Text></Pressable>)}</View>
      <Text style={styles.label}>場所</Text><TextInput editable={canEdit} accessibilityLabel="場所" value={draft.location} onChangeText={(location) => setDraft({ ...draft, location })} maxLength={2000} placeholder="URL または住所" placeholderTextColor={palette.placeholder} autoCapitalize="none" style={styles.input} /><Text style={styles.hint}>Google Mapsの共有URLがおすすめです</Text>
      <Text style={styles.label}>参照リンク</Text>
      {(draft.referenceLinks ?? []).map((link, index) => <View key={index} style={styles.referenceFields}>
        <View style={styles.referenceHeading}><Text style={styles.hint}>リンク {index + 1}</Text><Pressable accessibilityRole="button" accessibilityLabel={`参照リンク${index + 1}を削除`} disabled={!canEdit} onPress={() => setDraft({ ...draft, referenceLinks: draft.referenceLinks?.filter((_, at) => at !== index) })} style={styles.removeLink}><SymbolView name={{ ios: 'trash', android: 'delete', web: 'delete' }} size={20} tintColor={palette.danger} /></Pressable></View>
        <TextInput editable={canEdit} accessibilityLabel={`参照リンク${index + 1}の表示名`} value={link.label} onChangeText={(label) => setDraft({ ...draft, referenceLinks: draft.referenceLinks?.map((item, at) => at === index ? { ...item, label } : item) })} maxLength={120} placeholder="表示名（任意）" placeholderTextColor={palette.placeholder} style={styles.input} />
        <TextInput editable={canEdit} accessibilityLabel={`参照リンク${index + 1}のURL`} value={link.url} onChangeText={(url) => setDraft({ ...draft, referenceLinks: draft.referenceLinks?.map((item, at) => at === index ? { ...item, url } : item) })} maxLength={2000} keyboardType="url" autoCapitalize="none" autoCorrect={false} placeholder="https://…" placeholderTextColor={palette.placeholder} style={styles.input} />
      </View>)}
      {canEdit && (draft.referenceLinks?.length ?? 0) < 20 ? <Pressable accessibilityRole="button" onPress={() => setDraft({ ...draft, referenceLinks: [...(draft.referenceLinks ?? []), { label: '', url: '' }] })} style={styles.mapButton}><SymbolView name={{ ios: 'plus', android: 'add', web: 'add' }} size={18} tintColor={palette.ocean} /><Text style={styles.actionText}>リンクを追加</Text></Pressable> : null}
      <Text style={styles.label}>営業時間</Text><TextInput editable={canEdit} accessibilityLabel="営業時間" value={draft.openingHours} onChangeText={(openingHours) => setDraft({ ...draft, openingHours })} maxLength={500} placeholder="例：10:00–18:00 ／ 月曜休み" placeholderTextColor={palette.placeholder} style={styles.input} />
      <Text style={styles.label}>予約状況</Text><View style={styles.options}>{reservationStatuses.map((item) => <Pressable accessibilityRole="button" key={item.value} disabled={!canEdit} onPress={() => setDraft({ ...draft, reservationStatus: item.value })} style={[styles.option, draft.reservationStatus === item.value && styles.filterSelected]}><Text style={styles.optionText}>{item.label}</Text></Pressable>)}</View>
      <Text style={styles.label}>メモ</Text><TextInput editable={canEdit} accessibilityLabel="場所のメモ" value={draft.note} onChangeText={(note) => setDraft({ ...draft, note })} maxLength={4000} multiline placeholder="食べたいもの、見たい展示など" placeholderTextColor={palette.placeholder} style={[styles.input, styles.memo]} />
      {canEdit && editing !== 'new' ? <Pressable accessibilityRole="button" onPress={remove} style={styles.delete}><Text style={styles.deleteText}>この場所を削除</Text></Pressable> : null}
      </>}
    </FormSheet> : null}
    {statusPlace ? <FormSheet visible title="ステータスを変更" onClose={() => setStatusPlace(null)}><Text style={styles.placeTitle}>{statusPlace.title}</Text>{placeStatuses.map((entry) => <Pressable accessibilityRole="button" key={entry.value} disabled={!canEdit} onPress={() => { updatePlace(statusPlace.id, { ...statusPlace, status: entry.value }); setStatusPlace(null); }} style={[styles.option, statusPlace.status === entry.value && styles.filterSelected]}><PlaceStatusIcon status={entry.value} /><Text style={styles.optionText}>{entry.label}{statusPlace.status === entry.value ? '　✓' : ''}</Text></Pressable>)}</FormSheet> : null}
    {planning ? <FormSheet visible title="しおりに追加" onClose={() => setPlanning(null)} onSave={canEdit ? plan : undefined} saveLabel="追加" canSave={Boolean(day)}><Text style={styles.placeTitle}>{planning.title}</Text><DateRangePicker mode="single" startDate={day} endDate={day} label="訪問日" onChange={(range) => setDay(range.startDate)} /></FormSheet> : null}
  </View>;
}
const createStyles = (palette: Palette) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.canvas }, content: { width: '100%', maxWidth: 800, alignSelf: 'center', paddingHorizontal: 20, paddingBottom: 110, gap: 16 },
  search: { minHeight: 48, backgroundColor: palette.paper, borderRadius: 12, paddingHorizontal: 16, fontSize: 15, color: palette.ink }, filters: { gap: 6 }, filter: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 24, paddingHorizontal: 14, paddingVertical: 11, backgroundColor: palette.mist }, filterSelected: { backgroundColor: palette.sky }, filterText: { color: palette.slate, fontSize: 12 }, filterTextSelected: { color: palette.ink, fontWeight: '700' },
  card: { borderRadius: 20, backgroundColor: palette.paper, overflow: 'hidden' }, visited: { backgroundColor: palette.successSurface }, cardBody: { padding: 20, gap: 10 }, cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, serial: { color: palette.smoke, fontFamily: mono, fontSize: 10, letterSpacing: 1 }, reservation: { color: palette.ocean, fontSize: 11 }, needed: { color: palette.warning }, placeTitle: { color: palette.ink, fontSize: 21, lineHeight: 29, fontWeight: '700' }, note: { color: palette.slate, fontSize: 14, lineHeight: 23 }, hours: { color: palette.slate, fontSize: 12, lineHeight: 20, marginTop: 4 }, location: { color: palette.smoke, fontSize: 12 },
  cardFooter: { padding: 12, paddingHorizontal: 16, borderTopWidth: 1, borderStyle: 'dashed', borderColor: palette.ash, flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between' }, status: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, minHeight: 36, justifyContent: 'center', backgroundColor: palette.soft, borderRadius: 20 }, statusVisited: { backgroundColor: palette.success }, statusText: { color: palette.ink, fontSize: 12, fontWeight: '600' }, cardActions: { flexDirection: 'row', gap: 8 }, action: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 6, minHeight: 36, justifyContent: 'center' }, actionText: { color: palette.ocean, fontSize: 12, fontWeight: '600' },
  empty: { paddingVertical: 60, alignItems: 'center', gap: 24 }, emptyPlaceMark: { width: 96, height: 96, borderRadius: 48, backgroundColor: palette.sky, alignItems: 'center', justifyContent: 'center' }, emptyPlaceAdd: { position: 'absolute', right: 0, bottom: 0, width: 30, height: 30, borderRadius: 15, backgroundColor: palette.ocean, borderWidth: 3, borderColor: palette.canvas, alignItems: 'center', justifyContent: 'center' }, emptyTitle: { color: palette.slate, fontSize: 18, fontWeight: '600' }, primary: { paddingHorizontal: 20, paddingVertical: 15, backgroundColor: palette.ocean, borderRadius: 12 }, primaryText: { color: palette.onOcean, fontSize: 14, fontWeight: '700' },
  details: { gap: 24 }, detailTitle: { color: palette.ink, fontSize: 28, lineHeight: 38, fontWeight: '700' }, detailStatus: { flexDirection: 'row', alignItems: 'center', gap: 8 }, detailSection: { gap: 8 }, detailLabel: { color: palette.smoke, fontSize: 12, fontWeight: '600' }, detailValue: { color: palette.ink, fontSize: 16, lineHeight: 26 }, mapButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 48, borderRadius: 12, backgroundColor: palette.sky },
  referenceFields: { gap: 8 }, referenceHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, removeLink: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }, referenceButton: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, padding: 14, borderRadius: 12, backgroundColor: palette.sky }, referenceCopy: { flex: 1, minWidth: 0, gap: 4 }, referenceTitle: { color: palette.ocean, fontSize: 15, fontWeight: '600' }, referenceUrl: { color: palette.slate, fontSize: 12 },
  label: { color: palette.slate, fontSize: 13, fontWeight: '600', marginTop: 8 }, input: { minHeight: 52, padding: 16, borderRadius: 10, backgroundColor: palette.paper, color: palette.ink, fontSize: 16 }, memo: { minHeight: 110, textAlignVertical: 'top' }, hint: { fontSize: 12, color: palette.smoke, marginTop: -4 }, options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, option: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, backgroundColor: palette.paper, borderRadius: 10 }, optionText: { color: palette.ink, fontSize: 13 }, delete: { minHeight: 48, justifyContent: 'center', alignItems: 'center', marginTop: 16 }, deleteText: { color: palette.danger, fontSize: 14 }, notice: { padding: 14, borderRadius: 10, backgroundColor: palette.sky }, noticeText: { color: palette.ink, fontSize: 13 },
});
