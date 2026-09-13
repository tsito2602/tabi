import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { usePalette, useThemedStyles } from '@/theme/theme-provider';
import { type Palette } from '@/constants/design';
import { FormSheet } from '@/components/form-sheet';
import { PlaceStatusIcon } from '@/components/place-status-icon';
import { useToast } from '@/components/toast';
import { useTravel } from '@/data/travel-provider';
import type { Place, PlaceInput } from '@/data/types';
import { mapUrl, referenceUrl, placeStatuses, reservationStatuses } from '@/data/places';
import { confirmDeletion } from '@/utils/confirm-deletion';

const empty: PlaceInput = { title: '', note: '', openingHours: '', reservationStatus: 'not_needed', location: '', referenceLinks: [], status: 'want' };

type Props = { place?: Place; onClose: () => void; onPlan?: (place: Place) => void; onEditSchedule?: () => void };

export function PlaceSheet({ place, onClose, onPlan, onEditSchedule }: Props) {
  const palette = usePalette();
  const styles = useThemedStyles(createStyles);
  const toast = useToast();
  const { canEdit, places, items, createPlace, updatePlace, deletePlace } = useTravel();
  const [editingId, setEditingId] = useState(place?.id);
  const [viewing, setViewing] = useState(Boolean(place));
  const [draft, setDraft] = useState<PlaceInput>(() => place ? { ...place, referenceLinks: place.referenceLinks ?? [] } : empty);
  const [initial, setInitial] = useState(() => JSON.stringify(draft));
  const [error, setError] = useState('');
  const currentPlace = places.find((entry) => entry.id === editingId) ?? (editingId ? { id: editingId, ...draft } : undefined);
  const details = currentPlace ?? draft;
  const itineraryItem = items.find((item) => item.id === details.itineraryItemId);
  const edit = () => {
    const value = { ...details, referenceLinks: details.referenceLinks ?? [] };
    setDraft(value); setInitial(JSON.stringify(value)); setError(''); setViewing(false);
  };
  const save = () => {
    if (!draft.title.trim()) return setError('タイトルを入力してください');
    if (draft.location.trim() && !mapUrl(draft.location)) return setError('場所は住所か、http / httpsのURLを入力してください');
    const referenceLinks = (draft.referenceLinks ?? []).map((link) => ({ label: link.label.trim(), url: link.url.trim() })).filter((link) => link.label || link.url);
    if (referenceLinks.some((link) => !referenceUrl(link.url))) return setError('参照リンクはhttp / httpsのURLを入力してください');
    const input = { ...draft, title: draft.title.trim(), location: draft.location.trim(), referenceLinks };
    if (!canEdit) return;
    const id = editingId ?? createPlace(input);
    if (editingId) updatePlace(id, input);
    setEditingId(id); setDraft(input); setInitial(JSON.stringify(input)); setError('');
    setViewing(true); toast('場所を保存しました');
  };
  const remove = () => { if (!editingId) return; confirmDeletion('この場所を削除しますか？', draft.title, () => { deletePlace(editingId); onClose(); }); };
  return (
    <FormSheet visible presentation={viewing ? 'detail' : 'form'} title={viewing ? '場所の詳細' : !editingId ? '場所を追加' : '場所を編集'} onClose={onClose} onSave={canEdit ? viewing ? edit : save : undefined} saveLabel={viewing ? '編集' : '保存'} canSave={viewing || Boolean(draft.title.trim())} dirty={!viewing && JSON.stringify(draft) !== initial} error={error}>
      {viewing ? <View testID="place-details" style={styles.details}>
        <Text accessibilityRole="header" selectable style={styles.detailTitle}>{details.title}</Text>
        {onPlan && currentPlace ? <Pressable accessibilityRole="button" style={styles.mapButton} onPress={() => onPlan(currentPlace)}><Text style={styles.actionText}>{items.some((item) => item.id === details.itineraryItemId) ? 'しおりを見る' : 'しおりへ'}</Text></Pressable> : null}
        {onEditSchedule && itineraryItem ? <View style={styles.detailSection}><Text style={styles.detailLabel}>予定の日時</Text><Text style={styles.detailValue}>{itineraryItem.day.replaceAll('-', '/')}　{itineraryItem.time || '時刻未定'}</Text>{canEdit ? <Pressable accessibilityRole="button" style={styles.mapButton} onPress={onEditSchedule}><Text style={styles.actionText}>日時を編集</Text></Pressable> : null}</View> : null}
        <View style={styles.detailStatus}><PlaceStatusIcon status={details.status} size={20} /><Text style={styles.statusText}>{placeStatuses.find((item) => item.value === details.status)?.label}</Text></View>
        {details.location ? <View style={styles.detailSection}><Text style={styles.detailLabel}>場所</Text><Text selectable style={styles.detailValue}>{details.location}</Text></View> : null}
        <Pressable accessibilityRole="button" accessibilityLabel={`${details.title}の地図を開く`} onPress={() => { const url = mapUrl(details.location, details.title); if (url) void Linking.openURL(url); }} style={styles.mapButton}><SymbolView name={{ ios: 'map', android: 'map', web: 'map' }} size={20} tintColor={palette.ocean} /><Text style={styles.actionText}>地図を開く</Text></Pressable>
        {details.referenceLinks?.length ? <View style={styles.detailSection}><Text style={styles.detailLabel}>参照リンク</Text>{details.referenceLinks.map((link, index) => {
          const url = referenceUrl(link.url);
          return url ? <Pressable key={index} accessibilityRole="link" accessibilityLabel={`${link.label || new URL(url).hostname}を開く`} onPress={() => { void Linking.openURL(url).catch(() => toast('リンクを開けませんでした')); }} style={styles.referenceButton}>
            <SymbolView name={{ ios: 'link', android: 'link', web: 'link' }} size={20} tintColor={palette.ocean} />
            <View style={styles.referenceCopy}><Text style={styles.referenceTitle}>{link.label || new URL(url).hostname}</Text><Text numberOfLines={1} style={styles.referenceUrl}>{url}</Text></View>
          </Pressable> : null;
        })}</View> : null}
        {details.openingHours ? <View style={styles.detailSection}><Text style={styles.detailLabel}>営業時間</Text><Text selectable style={styles.detailValue}>{details.openingHours}</Text></View> : null}
        <View style={styles.detailSection}><Text style={styles.detailLabel}>予約状況</Text><Text style={[styles.detailValue, details.reservationStatus === 'needed' && styles.needed]}>{reservationStatuses.find((item) => item.value === details.reservationStatus)?.label}</Text></View>
        {details.note ? <View style={styles.detailSection}><Text style={styles.detailLabel}>メモ</Text><Text selectable style={styles.detailValue}>{details.note}</Text></View> : null}
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
      {canEdit && Boolean(editingId) ? <Pressable accessibilityRole="button" onPress={remove} style={styles.delete}><Text style={styles.deleteText}>この場所を削除</Text></Pressable> : null}
      </>}
    </FormSheet>
  );
}
const createStyles = (palette: Palette) => StyleSheet.create({
  filterSelected: { backgroundColor: palette.sky },
  needed: { color: palette.warning },
  statusText: { color: palette.ink, fontSize: 12, fontWeight: '600' },
  actionText: { color: palette.ocean, fontSize: 12, fontWeight: '600' },
  details: { gap: 24 },
  detailTitle: { color: palette.ink, fontSize: 28, lineHeight: 38, fontWeight: '700' },
  detailStatus: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  detailSection: { gap: 8 },
  detailLabel: { color: palette.smoke, fontSize: 12, fontWeight: '600' },
  detailValue: { color: palette.ink, fontSize: 16, lineHeight: 26 },
  mapButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 48, borderRadius: 12, backgroundColor: palette.sky },
  referenceFields: { gap: 8 },
  referenceHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  removeLink: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  referenceButton: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, padding: 14, borderRadius: 12, backgroundColor: palette.sky },
  referenceCopy: { flex: 1, minWidth: 0, gap: 4 },
  referenceTitle: { color: palette.ocean, fontSize: 15, fontWeight: '600' },
  referenceUrl: { color: palette.slate, fontSize: 12 },
  label: { color: palette.slate, fontSize: 13, fontWeight: '600', marginTop: 8 },
  input: { minHeight: 52, padding: 16, borderRadius: 10, backgroundColor: palette.paper, color: palette.ink, fontSize: 16 },
  memo: { minHeight: 110, textAlignVertical: 'top' },
  hint: { fontSize: 12, color: palette.smoke, marginTop: -4 },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, backgroundColor: palette.paper, borderRadius: 10 },
  optionText: { color: palette.ink, fontSize: 13 },
  delete: { minHeight: 48, justifyContent: 'center', alignItems: 'center', marginTop: 16 },
  deleteText: { color: palette.danger, fontSize: 14 },
});
