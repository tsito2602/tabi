import type { DetailOrigin } from '@/utils/detail-origin';
import { bookingDurationLabel } from '@/data/booking-duration';
import { usePalette, useThemedStyles } from '@/theme/theme-provider';
import { FileDrop, type DroppedFile } from './file-drop';
import { type ComponentProps, type Dispatch, type SetStateAction, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { SymbolView } from 'expo-symbols';
import { mapUrl } from '@/data/places';
import * as Sharing from 'expo-sharing';
import { useToast } from '@/components/toast';
import { CopyButton } from '@/components/copy-button';
import { FormSheet } from '@/components/form-sheet';
import { BookingRoute } from '@/components/booking-route';
import { DateRangePicker } from '@/components/date-range-picker';
import { mono, type Palette } from '@/constants/design';
import { findAirports, type Airport } from '@/data/airports';
import { cacheBookingDocument, getCachedDocumentUri, removeCachedBookingDocument } from '@/data/booking-document-cache';
import { findMatchingItineraryItem } from '@/data/booking-match';
import { useTravel } from '@/data/travel-provider';
import { Booking, BookingDocument, BookingKind } from '@/data/types';
import { confirmDeletion } from '@/utils/confirm-deletion';
import { addDays, formatDate, validDate } from '@/utils/dates';

export const BOOKING_KINDS: { value: BookingKind; label: string; short: string; icon: string }[] = [
  { value: 'flight', label: '航空券', short: 'FLIGHT', icon: '✈' },
  { value: 'hotel', label: 'ホテル', short: 'HOTEL', icon: '⌂' },
  { value: 'train', label: '鉄道', short: 'TRAIN', icon: '↔' },
  { value: 'car', label: '車', short: 'CAR', icon: '◉' },
  { value: 'restaurant', label: '飲食', short: 'DINING', icon: '◇' },
  { value: 'ticket', label: '入場券', short: 'TICKET', icon: '◎' },
  { value: 'other', label: 'その他', short: 'OTHER', icon: '＋' },
];

type Draft = Pick<Booking, 'kind' | 'title' | 'detail' | 'location' | 'origin' | 'originCode' | 'destination' | 'destinationCode' | 'day' | 'time' | 'endDay' | 'endTime' | 'confirmationCode' | 'note' | 'durationMinutes'>;

function blankDraft(day: string, kind: BookingKind = 'flight'): Draft {
  const defaults: Record<BookingKind, [string, string]> = {
    flight: ['10:00', '12:00'], hotel: ['15:00', '11:00'], train: ['09:00', '11:00'], car: ['09:00', '18:00'],
    restaurant: ['19:00', '19:00'], ticket: ['10:00', '10:00'], other: ['10:00', '10:00'],
  };
  return { kind, title: '', detail: '', location: '', origin: '', originCode: '', destination: '', destinationCode: '', day, time: defaults[kind][0], endDay: kind === 'hotel' && day ? addDays(day, 1) : day, endTime: defaults[kind][1], confirmationCode: '', note: '' };
}

export function BookingSheet({ booking, onClose, detailOrigin }: { booking?: Booking; onClose: () => void; detailOrigin?: DetailOrigin }) {
  const styles = useThemedStyles(createStyles);

  const toast = useToast();
  const { canEdit, createBooking, deleteBooking, deleteItem, documentsByBooking, items, selectedTrip, updateBooking } = useTravel();
  const [draft, setDraft] = useState<Draft>(() => booking ? {
    kind: booking.kind, title: booking.title, detail: booking.detail,
    location: booking.location ?? (booking.kind === 'hotel' ? booking.detail : ''),
    origin: booking.origin, originCode: booking.originCode,
    destination: booking.destination, destinationCode: booking.destinationCode,
    day: booking.day, time: booking.time, endDay: booking.endDay, endTime: booking.endTime,
    confirmationCode: booking.confirmationCode, note: booking.note, durationMinutes: booking.durationMinutes ?? null,
  } : blankDraft(selectedTrip?.startsOn ?? ''));
  const [initialDraft, setInitialDraft] = useState(() => JSON.stringify(draft));
  const [viewing, setViewing] = useState(Boolean(booking));
  const [editingId, setEditingId] = useState<string | null>(booking?.id ?? null);
  const [formError, setFormError] = useState('');
  const [mergeItemId, setMergeItemId] = useState<string | null>(null);
  const matchingCandidate = findMatchingItineraryItem(items, draft);
  const selectedMergeItem = matchingCandidate?.item.id === mergeItemId ? matchingCandidate.item : null;

  const save = async () => {
    if (draft.durationMinutes != null && (!Number.isInteger(draft.durationMinutes) || draft.durationMinutes < 1 || draft.durationMinutes > 10080)) { setFormError('乗っている時間は1〜10080分で入力してください'); return; }
    const needsRoute = ['flight', 'train', 'car'].includes(draft.kind);
    if (!draft.title.trim() || !validDate(draft.day) || (needsRoute && (!(draft.origin.trim() || draft.originCode) || !(draft.destination.trim() || draft.destinationCode)))) {
      setFormError(needsRoute ? '予約名、日付、出発地と到着地を入力してください' : '予約名と日付を入力してください');
      return;
    }
    if ((draft.time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(draft.time)) || (draft.endTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(draft.endTime))) {
      setFormError('時刻は24時間表記（例 09:30）で入力してください。');
      return;
    }
    if (draft.endDay && (!validDate(draft.endDay) || (draft.kind !== 'flight' && draft.endDay < draft.day))) {
      setFormError('終了日は開始日以降を選択してください。');
      return;
    }
    if (draft.kind !== 'flight' && !(draft.kind === 'train' && draft.durationMinutes) && draft.endDay === draft.day && draft.time && draft.endTime && draft.endTime < draft.time) {
      setFormError('終了時刻は開始時刻以降にしてください');
      return;
    }
    const location = draft.location?.trim() ?? '';
    if (location && !mapUrl(location)) {
      setFormError('場所は住所か、http / httpsのURLを入力してください');
      return;
    }
    const input = {
      ...draft,
      title: draft.title.trim(),
      detail: draft.kind === 'hotel' ? location : draft.detail.trim(),
      location,
      origin: draft.origin.trim(),
      destination: draft.destination.trim(),
      confirmationCode: draft.confirmationCode.trim(),
      note: draft.note.trim(),
    };
    const mergedContext = selectedMergeItem
      ? [selectedMergeItem.title.trim() !== input.title ? selectedMergeItem.title.trim() : '', selectedMergeItem.note.trim()].filter(Boolean).join(' — ')
      : '';
    const savedInput = mergedContext
      ? { ...input, note: [input.note, `日程から：${mergedContext}`].filter(Boolean).join('\n') }
      : input;
    try {
      if (editingId) updateBooking(editingId, savedInput);
      else {
        const id = createBooking(savedInput);
        setEditingId(id);
      }
      if (selectedMergeItem) deleteItem(selectedMergeItem.id);
      setDraft(savedInput);
      setInitialDraft(JSON.stringify(savedInput));
      setViewing(true); toast('予約を保存しました');
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : '予約を保存できませんでした。');
    }
  };

  const remove = () => {
    if (!editingId) return;
    confirmDeletion('予約を削除しますか？', 'この操作は取り消せません。', () => {
      for (const document of documentsByBooking[editingId] ?? []) removeCachedBookingDocument(document.id, document.filename);
      deleteBooking(editingId);
      onClose();
    });
  };

  return (
      <FormSheet detailOrigin={detailOrigin} visible presentation={viewing ? 'detail' : 'form'} title={viewing ? '予約の詳細' : editingId ? '予約を編集' : '予約を追加'} onClose={onClose} onSave={canEdit ? viewing ? () => setViewing(false) : save : undefined} saveLabel={viewing ? '編集' : '保存'} canSave={viewing || Boolean(draft.title.trim())} dirty={!viewing && (JSON.stringify(draft) !== initialDraft || Boolean(selectedMergeItem))} error={formError}>
        {viewing && editingId ? <BookingDetails booking={{ id: editingId, ...draft }} documents={documentsByBooking[editingId] ?? []} /> : <>
              <Text style={styles.label}>種類</Text>
              <View style={styles.kindList}>
                {BOOKING_KINDS.map((kind) => <Pressable key={kind.value} accessibilityRole="radio" aria-checked={draft.kind === kind.value} onPress={() => setDraft((current) => ({ ...current, kind: kind.value }))} style={[styles.kindButton, draft.kind === kind.value && styles.kindSelected]}><Text style={[styles.kindText, draft.kind === kind.value && styles.kindTextSelected]}>{kind.label}</Text></Pressable>)}
              </View>

              <BookingFormFields draft={draft} setDraft={setDraft} />
              {draft.kind === 'flight' || draft.kind === 'train' ? <View>
                {bookingDurationLabel({ ...draft, durationMinutes: null }) ? <Text style={styles.placeName}>{bookingDurationLabel({ ...draft, durationMinutes: null })}</Text> : null}
                <Field label={draft.kind === 'flight' ? '飛行時間（分・任意）' : '乗車時間（分・任意）'} inputMode="numeric" maxLength={5} placeholder="空欄なら出発・到着日時から計算" value={draft.durationMinutes == null ? '' : String(draft.durationMinutes)} onChangeText={(value) => setDraft((current) => ({ ...current, durationMinutes: value ? Number(value) : null }))} />
                <Text style={styles.placeName}>{draft.kind === 'flight' ? '空港が未登録の場合は、航空券の飛行時間を入力できます。' : '時差をまたぐ列車は、乗車券に記載された時間を入力してください。'}</Text>
              </View> : null}
              {matchingCandidate ? <View style={[styles.matchCard, selectedMergeItem && styles.matchCardSelected]}>
                <View style={styles.matchCopy}>
                  <Text style={styles.matchEyebrow}>{matchingCandidate.reason}</Text>
                  <Text numberOfLines={1} style={styles.matchTitle}>{matchingCandidate.item.time}　{matchingCandidate.item.title}</Text>
                  <Text style={styles.matchHelp}>{selectedMergeItem ? '保存すると、この予定の内容を予約へ移して1件にまとめます。' : '選ばなければ、予定と予約は別々に残ります。'}</Text>
                </View>
                <Pressable accessibilityRole="button" onPress={() => setMergeItemId(selectedMergeItem ? null : matchingCandidate.item.id)} style={[styles.matchButton, selectedMergeItem && styles.matchButtonSelected]}>
                  <Text style={[styles.matchButtonText, selectedMergeItem && styles.matchButtonTextSelected]}>{selectedMergeItem ? '✓ まとめる' : 'まとめる'}</Text>
                </Pressable>
              </View> : null}
              {editingId ? <BookingDocuments bookingId={editingId} documents={documentsByBooking[editingId] ?? []} /> : <Text style={styles.documentNotice}>書類は予約を保存したあとに追加できます。</Text>}
              <Field label="メモ" multiline placeholder="任意" value={draft.note} onChangeText={(note) => setDraft((current) => ({ ...current, note }))} />
          {editingId && canEdit ? <Pressable accessibilityRole="button" onPress={remove} style={styles.deleteButton}><Text style={styles.deleteText}>この予約を削除</Text></Pressable> : null}
        </>}
      </FormSheet>
  );
}

function BookingDetails({ booking, documents }: { booking: Booking; documents: BookingDocument[] }) {
  const palette = usePalette();
  const toast = useToast();
  const hasLocation = ['hotel', 'restaurant', 'ticket', 'other'].includes(booking.kind);
  const location = booking.location ?? (booking.kind === 'hotel' ? booking.detail : '');
  const url = hasLocation ? mapUrl(location, booking.title) : null;
  const styles = useThemedStyles(createStyles);

  const kind = BOOKING_KINDS.find((entry) => entry.value === booking.kind);
  const route = Boolean(booking.originCode || booking.origin || booking.destinationCode || booking.destination);
  return <>
    <View style={styles.detailTicket}>
      <Text style={styles.detailKind}>{kind?.label}</Text>
      <Text testID="detail-target-title" style={styles.detailTitle}>{booking.title}</Text>
      {route ? <BookingRoute booking={booking} /> : null}
      {booking.detail && booking.kind !== 'hotel' ? <Text selectable style={styles.detailBody}>{booking.detail}</Text> : null}
      <View style={styles.detailDates}>
        <View style={styles.dateColumn}><Text style={styles.label}>{booking.kind === 'hotel' ? 'チェックイン' : route ? '出発' : '開始'}</Text><Text testID="detail-target-time" style={styles.detailTime}>{booking.time || '時刻未定'}</Text><Text style={styles.placeName}>{formatDate(booking.day, true)}</Text></View>
        {booking.endDay && (booking.endDay !== booking.day || booking.endTime !== booking.time) ? <View style={styles.dateColumn}><Text style={styles.label}>{booking.kind === 'hotel' ? 'チェックアウト' : route ? '到着' : '終了'}</Text><Text testID="detail-target-time-end" style={styles.detailTime}>{booking.endTime || '時刻未定'}</Text><Text style={styles.placeName}>{formatDate(booking.endDay, true)}</Text></View> : null}
      </View>
      {bookingDurationLabel(booking) ? <Text style={styles.journeyDuration}>{bookingDurationLabel(booking)}</Text> : null}
      {booking.kind === 'flight' ? <Text style={styles.placeName}>時刻は各空港の現地時刻</Text> : null}
    </View>
    {hasLocation ? <View style={styles.locationBlock}>
      {location && !/^https?:\/\//i.test(location) ? <Text selectable style={styles.detailBody}>{location}</Text> : null}
      {url ? <Pressable accessibilityRole="button" accessibilityLabel={`${booking.title}の地図を開く`} onPress={() => { void Linking.openURL(url).catch(() => toast('地図を開けませんでした')); }} style={styles.mapButton}>
        <SymbolView name={{ ios: 'map', android: 'map', web: 'map' }} size={20} tintColor={palette.ocean} />
        <Text style={styles.mapButtonText}>地図を開く</Text>
      </Pressable> : null}
    </View> : null}
    {booking.confirmationCode ? <View style={styles.confirmation}><View style={styles.confirmationCopy}><Text style={styles.label}>予約・確認番号</Text><Text selectable accessibilityLabel={`予約番号 ${booking.confirmationCode}`} style={styles.confirmationCode}>{booking.confirmationCode}</Text></View><CopyButton key={booking.confirmationCode} value={booking.confirmationCode} /></View> : null}
    <BookingDocuments bookingId={booking.id} documents={documents} readOnly />
    {booking.note ? <View style={styles.noteBlock}><Text style={styles.label}>メモ</Text><Text selectable style={styles.detailBody}>{booking.note}</Text></View> : null}
  </>;
}

function BookingDocuments({ bookingId, documents, readOnly = false }: { bookingId: string; documents: BookingDocument[]; readOnly?: boolean }) {
  const palette = usePalette();
  const styles = useThemedStyles(createStyles);

  const { canEdit: canEditTrip, deleteBookingDocument, downloadBookingDocument, uploadBookingDocument } = useTravel();
  const canEdit = canEditTrip && !readOnly;
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  const uploadLock = useRef(false);
  const [progress, setProgress] = useState('');
  const uploadFiles = async (files: DroppedFile[]) => {
    if (!canEdit || uploadLock.current || busy) return;
    uploadLock.current = true; setBusy('upload'); setError('');
    const errors: string[] = [];
    let uploaded = 0;
    const fallbackTypes: Record<string, string> = { pdf: 'application/pdf', gif: 'image/gif', heic: 'image/heic', heif: 'image/heif', jpeg: 'image/jpeg', jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
    try {
      for (const [index, file] of files.entries()) {
        setProgress(`${index + 1} / ${files.length} · ${file.name}`);
        try {
          if (!file.size) throw new Error('空のファイルです');
          if (file.size > 20 * 1024 * 1024) throw new Error('20MBを超えています');
          const extension = file.name.split('.').pop()?.toLowerCase();
          const contentType = (file.type || (extension ? fallbackTypes[extension] : '') || '').toLowerCase();
          if (!Object.values(fallbackTypes).includes(contentType)) throw new Error('画像かPDFを選択してください');
          const bytes = await file.arrayBuffer();
          if (bytes.byteLength > 20 * 1024 * 1024) throw new Error('20MBを超えています');
          const document = await uploadBookingDocument(bookingId, { filename: file.name, contentType, size: bytes.byteLength, bytes });
          cacheBookingDocument(document.id, document.filename, bytes); uploaded += 1;
        } catch (cause) { errors.push(`${file.name}: ${cause instanceof Error ? cause.message : '追加できませんでした'}`); }
      }
      setProgress(`${uploaded}件の書類を追加しました`);
      setError(errors.join('\n'));
    } finally { uploadLock.current = false; setBusy(null); }
  };
  const addDocuments = async () => {
    if (!canEdit || busy || uploadLock.current) return;
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ['image/*', 'application/pdf'], multiple: true, copyToCacheDirectory: true });
      if (result.canceled) return;
      await uploadFiles(result.assets.map((asset) => ({ name: asset.name, type: asset.mimeType ?? '', size: asset.size ?? asset.file?.size ?? 1, arrayBuffer: () => asset.file ? asset.file.arrayBuffer() : new File(asset.uri).arrayBuffer() })));
    } catch (cause) { setError(cause instanceof Error ? cause.message : '書類を追加できませんでした'); }
  };
  const downloadDocument = async (entry: BookingDocument) => {
    if (busy) return;
    setBusy(entry.id); setError('');
    try {
      const bytes = await downloadBookingDocument(bookingId, entry.id);
      const url = URL.createObjectURL(new Blob([bytes], { type: entry.contentType }));
      const link = document.createElement('a'); link.href = url; link.download = entry.filename;
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'ダウンロードできませんでした'); }
    finally { setBusy(null); }
  };

  const openDocument = async (document: BookingDocument) => {
    if (busy) return;
    setError('');
    setBusy(document.id);
    // Reserve the tab within the tap event so mobile browsers allow it.
    const preview = Platform.OS === 'web' ? window.open('', '_blank') : null;
    if (preview) preview.opener = null;
    try {
      if (Platform.OS === 'web' && !preview) throw new Error('書類を開くにはポップアップを許可してください');
      let uri = getCachedDocumentUri(document.id, document.filename);
      let bytes: ArrayBuffer | null = null;
      if (!uri) {
        bytes = await downloadBookingDocument(bookingId, document.id);
        uri = cacheBookingDocument(document.id, document.filename, bytes);
      }
      if (Platform.OS === 'web') {
        bytes ??= await downloadBookingDocument(bookingId, document.id);
        const objectUrl = URL.createObjectURL(new Blob([bytes], { type: document.contentType }));
        if (preview) preview.location.href = objectUrl;
        setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
      } else if (uri && await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { dialogTitle: document.filename, mimeType: document.contentType });
      } else {
        throw new Error('この端末では書類を開けません');
      }
    } catch (cause) {
      preview?.close();
      setError(cause instanceof Error ? cause.message : '書類を開けませんでした');
    } finally {
      setBusy(null);
    }
  };

  const removeDocument = (document: BookingDocument) => {
    confirmDeletion('書類を削除しますか？', document.filename, () => {
      removeCachedBookingDocument(document.id, document.filename);
      deleteBookingDocument(bookingId, document.id);
    });
  };

  return <View style={styles.documentsSection}>
    <View style={styles.documentsHeading}><Text style={styles.label}>書類</Text>{Platform.OS !== 'web' && canEdit ? <Pressable accessibilityRole="button" disabled={Boolean(busy)} onPress={addDocuments} style={({ pressed }) => [styles.documentAddButton, pressed && styles.pressed]}><Text style={styles.documentAddText}>＋ 画像・PDF</Text></Pressable> : null}</View>
    {Platform.OS === 'web' && canEdit ? <FileDrop label="この予約に書類をドロップ" selectLabel="画像・PDFを選択" hint="画像・PDF / 1ファイル20MBまで・複数選択可" accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.heic,.heif" multiple disabled={Boolean(busy)} onFiles={uploadFiles} /> : null}
    {documents.length ? <View style={styles.documentList}>{documents.map((document) => <View key={document.id} style={styles.documentRow}>
      <View style={styles.documentIcon}><Text style={styles.documentIconText}>{document.contentType === 'application/pdf' ? 'PDF' : 'IMG'}</Text></View>
      <Pressable accessibilityRole="button" accessibilityLabel={`${document.filename}を開く`} disabled={Boolean(busy)} onPress={() => openDocument(document)} style={({ pressed }) => [styles.documentCopy, pressed && styles.pressed]}>
        <Text numberOfLines={1} style={styles.documentName}>{document.filename}</Text><Text style={styles.documentMeta}>{formatFileSize(document.size)} · {getCachedDocumentUri(document.id, document.filename) ? '端末に保存済み' : '開いて確認'}</Text>
      </Pressable>
      {Platform.OS === 'web' ? <Pressable accessibilityRole="button" accessibilityLabel={`${document.filename}をダウンロード`} disabled={Boolean(busy)} onPress={() => void downloadDocument(document)} style={{ padding: 12 }}><Text style={{ color: palette.ocean, fontSize: 12, fontWeight: '600' }}>保存 ↓</Text></Pressable> : null}
      {busy === document.id ? <ActivityIndicator color={palette.ocean} size="small" /> : canEdit ? <Pressable accessibilityRole="button" accessibilityLabel={`${document.filename}を削除`} disabled={Boolean(busy)} onPress={() => removeDocument(document)} style={styles.documentDelete}><Text style={styles.documentDeleteText}>×</Text></Pressable> : null}
    </View>)}</View> : Platform.OS !== 'web' || !canEdit ? <View style={styles.documentEmpty}><Text style={styles.documentEmptyText}>{canEdit ? '画像やPDFを追加できます' : '書類はありません'}</Text></View> : null}
    {progress ? <Text accessibilityLiveRegion="polite" style={styles.documentMeta}>{progress}</Text> : null}
    {busy === 'upload' ? <View style={styles.uploading}><ActivityIndicator color={palette.ocean} size="small" /><Text style={styles.uploadingText}>アップロード中</Text></View> : null}
    {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
  </View>;
}

function formatFileSize(size: number) {
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function BookingFormFields({ draft, setDraft }: { draft: Draft; setDraft: Dispatch<SetStateAction<Draft>> }) {
  const set = <Key extends keyof Draft>(key: Key, value: Draft[Key]) => setDraft((current) => ({ ...current, [key]: value }));
  const dateTimeRange = (label: string, startLabel: string, endLabel: string) => (
    <DateRangePicker
      endDate={draft.endDay}
      endLabel={endLabel}
      endTime={draft.endTime}
      label={label}
      showTime
      startDate={draft.day}
      startLabel={startLabel}
      startTime={draft.time}
      onChange={({ startDate, endDate, startTime, endTime }) => setDraft((current) => ({ ...current, day: startDate, endDay: endDate, time: startTime, endTime }))}
    />
  );
  const singleDateTime = (label: string, dateLabel: string, timeValue = draft.time) => (
    <DateRangePicker
      endDate={draft.day}
      label={label}
      mode="single"
      showTime
      startDate={draft.day}
      startLabel={dateLabel}
      startTime={timeValue}
      onChange={({ startDate, startTime }) => setDraft((current) => ({ ...current, day: startDate, endDay: startDate, time: startTime, endTime: startTime }))}
    />
  );
  const confirmation = (label = '予約・確認番号') => (
    <Field autoCapitalize="characters" label={label} placeholder="任意" value={draft.confirmationCode} onChangeText={(value) => set('confirmationCode', value)} />
  );

  if (draft.kind === 'flight') return <>
    <Field testID="booking-title" label="便名・航空会社" placeholder="例：ANA 257便" value={draft.title} onChangeText={(value) => set('title', value)} />
    <AirportField label="出発空港" placeholder="空港名・都市・HND" value={draft.origin} code={draft.originCode} onChange={(airport) => setDraft((current) => ({ ...current, origin: airport.name, originCode: airport.code }))} onChangeText={(value) => setDraft((current) => ({ ...current, origin: value, originCode: '' }))} />
    <AirportField label="到着空港" placeholder="空港名・都市・VIE" value={draft.destination} code={draft.destinationCode} onChange={(airport) => setDraft((current) => ({ ...current, destination: airport.name, destinationCode: airport.code }))} onChangeText={(value) => setDraft((current) => ({ ...current, destination: value, destinationCode: '' }))} />
    {dateTimeRange('フライト日時', '出発', '到着')}
    {confirmation('予約番号')}
  </>;

  if (draft.kind === 'hotel') return <>
    <Field label="ホテル名" placeholder="例：Hotel Astoria Vienna" value={draft.title} onChangeText={(value) => set('title', value)} />
    <LocationField value={draft.location ?? ''} onChangeText={(value) => set('location', value)} />
    {dateTimeRange('宿泊期間', 'チェックイン', 'チェックアウト')}
    {confirmation()}
  </>;

  if (draft.kind === 'train' || draft.kind === 'car') {
    const car = draft.kind === 'car';
    return <>
      <Field label={car ? 'レンタカー会社・プラン' : '列車名・便名'} placeholder={car ? '例：トヨタレンタカー' : '例：のぞみ25号'} value={draft.title} onChangeText={(value) => set('title', value)} />
      <Field label={car ? '受取場所' : '乗車駅'} placeholder={car ? '例：博多駅前店' : '例：東京駅'} value={draft.origin} onChangeText={(value) => setDraft((current) => ({ ...current, origin: value, originCode: '' }))} />
      <Field label={car ? '返却場所' : '降車駅'} placeholder={car ? '例：福岡空港店' : '例：京都駅'} value={draft.destination} onChangeText={(value) => setDraft((current) => ({ ...current, destination: value, destinationCode: '' }))} />
      {dateTimeRange(car ? '利用期間' : '乗車日時', car ? '受取' : '出発', car ? '返却' : '到着')}
      {confirmation()}
    </>;
  }

  const config = draft.kind === 'restaurant'
    ? { title: '店名', titlePlaceholder: '例：博多もつ鍋 やま中', detail: '人数・席', detailPlaceholder: '例：2名・テーブル席', date: '予約日', time: '予約時刻' }
    : draft.kind === 'ticket'
      ? { title: '施設・イベント名', titlePlaceholder: '例：美術館 入場券', detail: '券種・座席', detailPlaceholder: '例：一般 2名', date: '利用日', time: '利用時刻' }
      : { title: '予約名', titlePlaceholder: '例：現地ツアー', detail: '詳細', detailPlaceholder: '例：集合場所・参加人数', date: '日付', time: '時刻' };
  return <>
    <Field label={config.title} placeholder={config.titlePlaceholder} value={draft.title} onChangeText={(value) => set('title', value)} />
    <Field label={config.detail} placeholder={config.detailPlaceholder} value={draft.detail} onChangeText={(value) => set('detail', value)} />
    <LocationField value={draft.location ?? ''} onChangeText={(value) => set('location', value)} />
    {singleDateTime(`${config.date}・${config.time}`, config.date)}
    {confirmation()}
  </>;
}

function AirportField({ code, label, onChange, onChangeText, placeholder, value }: { code: string; label: string; onChange: (airport: Airport) => void; onChangeText: (value: string) => void; placeholder: string; value: string }) {
  const palette = usePalette();
  const styles = useThemedStyles(createStyles);

  const matches = findAirports(value);
  const selected = Boolean(code && matches.some((airport) => airport.code === code && airport.name === value));
  return <View style={styles.field}>
    <Text style={styles.label}>{label}</Text>
    <View style={styles.airportInputWrap}>
      <TextInput accessibilityLabel={label} autoCapitalize="characters" onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={palette.placeholder} style={[styles.input, code && styles.airportInput]} value={value} />
      {code ? <View style={styles.codeBadge}><Text style={styles.codeText}>{code}</Text></View> : null}
    </View>
    {!selected && matches.length ? <View style={styles.suggestions}>
      {matches.map((airport) => <Pressable accessibilityRole="button" accessibilityLabel={`${airport.name} ${airport.code}を選択`} key={airport.code} onPress={() => onChange(airport)} style={({ pressed }) => [styles.suggestion, pressed && styles.pressed]}>
        <View style={styles.suggestionCopy}><Text style={styles.suggestionName}>{airport.name}</Text><Text style={styles.suggestionCity}>{airport.city}</Text></View>
        <Text style={styles.suggestionCode}>{airport.code}</Text>
      </Pressable>)}
    </View> : null}
  </View>;
}

function LocationField({ value, onChangeText }: { value: string; onChangeText: (value: string) => void }) {
  const styles = useThemedStyles(createStyles);
  return <View style={styles.field}>
    <Field label="場所" placeholder="URL または住所" value={value} onChangeText={onChangeText} maxLength={2000} autoCapitalize="none" autoCorrect={false} />
    <Text style={styles.locationHint}>Google Mapsの共有URLがおすすめです</Text>
  </View>;
}

function Field({ label, ...props }: { label: string } & ComponentProps<typeof TextInput>) {
  const palette = usePalette();
  const styles = useThemedStyles(createStyles);

  return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput accessibilityLabel={label} maxLength={props.multiline ? 4000 : 240} placeholderTextColor={palette.placeholder} style={[styles.input, props.multiline && styles.inputMultiline]} {...props} /></View>;
}

const createStyles = (palette: Palette) => StyleSheet.create({
  detailTicket: { backgroundColor: palette.paper, borderRadius: 20, padding: 22, gap: 12 },
  detailKind: { color: palette.ocean, fontSize: 12, fontWeight: '700' },
  detailTitle: { color: palette.ink, fontSize: 25, fontWeight: '800', lineHeight: 34 },
  placeName: { color: palette.slate, fontSize: 12, lineHeight: 19 },
  detailDates: { flexDirection: 'row', flexWrap: 'wrap', gap: 20, borderTopWidth: 1, borderStyle: 'dashed', borderTopColor: palette.ash, paddingTop: 18 },
  dateColumn: { flex: 1, minWidth: 120, gap: 4 },
  detailTime: { color: palette.ink, fontSize: 24, fontWeight: '700', fontVariant: ['tabular-nums'] },
  confirmation: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 20, borderRadius: 16, backgroundColor: palette.sky },
  confirmationCopy: { flex: 1 },
  confirmationCode: { color: palette.ink, fontSize: 21, fontWeight: '700', marginTop: 8 },
  journeyDuration: { color: palette.ocean, fontSize: 14, lineHeight: 22, fontWeight: '600', marginTop: 12 },
  detailBody: { fontSize: 15, color: palette.ink, lineHeight: 24 },
  locationBlock: { gap: 12 },
  locationHint: { color: palette.smoke, fontSize: 11, lineHeight: 17 },
  mapButton: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: palette.sky, borderRadius: 12 },
  mapButtonText: { color: palette.ocean, fontSize: 14, fontWeight: '700' },
  noteBlock: { gap: 8, padding: 8 },
  kindList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: -8 },
  kindButton: { minHeight: 38, justifyContent: 'center', backgroundColor: palette.paper, borderRadius: 64, paddingHorizontal: 14 },
  kindSelected: { backgroundColor: palette.sky },
  kindText: { color: palette.slate, fontSize: 12, fontWeight: '700' },
  kindTextSelected: { color: palette.ink },
  field: { gap: 8 },
  label: { color: palette.slate, fontFamily: mono, fontSize: 11 },
  input: { minHeight: 52, backgroundColor: palette.paper, borderRadius: 8, color: palette.ink, fontSize: 15, paddingHorizontal: 14, paddingVertical: 12 },
  inputMultiline: { minHeight: 88, textAlignVertical: 'top' },
  airportInputWrap: { position: 'relative' },
  airportInput: { paddingRight: 68 },
  codeBadge: { position: 'absolute', right: 10, top: 10, minWidth: 48, height: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.sky, borderRadius: 8 },
  codeText: { color: palette.ink, fontFamily: mono, fontSize: 13, fontWeight: '900', letterSpacing: 0.8 },
  suggestions: { overflow: 'hidden', backgroundColor: palette.paper, borderRadius: 12, marginTop: -2 },
  suggestion: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.ash, paddingHorizontal: 14 },
  suggestionCopy: { flex: 1, minWidth: 0 },
  suggestionName: { color: palette.ink, fontSize: 13, fontWeight: '700' },
  suggestionCity: { color: palette.smoke, fontSize: 10, marginTop: 2 },
  suggestionCode: { color: palette.ocean, fontFamily: mono, fontSize: 15, fontWeight: '900', letterSpacing: 1 },
  matchCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, backgroundColor: palette.paper, padding: 14 },
  matchCardSelected: { backgroundColor: palette.sky },
  matchCopy: { flex: 1, minWidth: 0 },
  matchEyebrow: { color: palette.ocean, fontFamily: mono, fontSize: 9, fontWeight: '800' },
  matchTitle: { color: palette.ink, fontSize: 14, fontWeight: '800', marginTop: 4 },
  matchHelp: { color: palette.slate, fontSize: 10, lineHeight: 15, marginTop: 4 },
  matchButton: { minHeight: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 19, backgroundColor: palette.sky, paddingHorizontal: 13 },
  matchButtonSelected: { backgroundColor: palette.ocean },
  matchButtonText: { color: palette.ocean, fontSize: 11, fontWeight: '800' },
  matchButtonTextSelected: { color: palette.onOcean },
  documentNotice: { color: palette.smoke, fontSize: 11, lineHeight: 17 },
  documentsSection: { gap: 10 },
  documentsHeading: { minHeight: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  documentAddButton: { minHeight: 36, justifyContent: 'center', borderRadius: 18, backgroundColor: palette.sky, paddingHorizontal: 13 },
  documentAddText: { color: palette.ocean, fontSize: 11, fontWeight: '800' },
  documentList: { overflow: 'hidden', borderRadius: 12, backgroundColor: palette.paper },
  documentRow: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.ash, paddingLeft: 10, paddingRight: 6 },
  documentIcon: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: palette.sky },
  documentIconText: { color: palette.ocean, fontFamily: mono, fontSize: 9, fontWeight: '900' },
  documentCopy: { flex: 1, minWidth: 0, paddingVertical: 10 },
  documentName: { color: palette.ink, fontSize: 13, fontWeight: '800' },
  documentMeta: { color: palette.smoke, fontSize: 9, marginTop: 4 },
  documentDelete: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  documentDeleteText: { color: palette.smoke, fontSize: 22, lineHeight: 24 },
  documentEmpty: { minHeight: 64, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: palette.paper },
  documentEmptyText: { color: palette.smoke, fontSize: 11 },
  uploading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  uploadingText: { color: palette.slate, fontSize: 11 },
  error: { color: palette.danger, fontSize: 12 },
  deleteButton: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 8 },
  deleteText: { color: palette.danger, fontSize: 14, fontWeight: '700' },
  pressed: { opacity: 0.62 },
});
