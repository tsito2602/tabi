import type { GestureResponderEvent } from 'react-native';
import { MotionModal } from '@/components/motion-modal';
import { MotionPresence } from '@/components/motion-presence';
import { captureDetailOrigin, type DetailOrigin } from '@/utils/detail-origin';
import * as Crypto from 'expo-crypto';
import { SymbolView } from 'expo-symbols';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FloatingAddButton } from '@/components/floating-add-button';
import { useTripHeaderHeight } from '@/components/trip-header-context';
import { useTravel } from '@/data/travel-provider';
import type { TravelNote } from '@/data/types';
import { useModalViewport } from '@/hooks/use-modal-viewport';
import { usePalette, useThemedStyles } from '@/theme/theme-provider';
import type { Palette } from '@/constants/design';
import { confirmDeletion } from '@/utils/confirm-deletion';

const titleOf = (body: string) => body.trim().split('\n')[0] || '新規メモ';
const dateOf = (stamp: number) => new Date(stamp * 1000).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' });

export default function NotesScreen() {
  const palette = usePalette();
  const styles = useThemedStyles(createStyles);
  const headerHeight = useTripHeaderHeight();
  const { notes, canEdit } = useTravel();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<TravelNote | null>(null);
  const [detailOrigin, setDetailOrigin] = useState<DetailOrigin>();
  const filtered = useMemo(() => notes.filter((note) => note.body.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())).sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt || a.id.localeCompare(b.id)), [notes, search]);
  const add = (event: GestureResponderEvent) => { setDetailOrigin(captureDetailOrigin(event)); setEditing({ id: Crypto.randomUUID(), body: '', pinned: false, updatedAt: Math.floor(Date.now() / 1000) }); };
  return <View style={styles.screen}>
    <ScrollView testID="notes-scroll" keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, { paddingTop: headerHeight + 24 }]}>
      {notes.length ? <TextInput accessibilityLabel="メモを検索" value={search} onChangeText={setSearch} placeholder="検索" placeholderTextColor={palette.placeholder} style={styles.search} /> : null}
      {!notes.length ? <View style={styles.empty}>
        <View style={styles.emptyIcon}><SymbolView name={{ ios: 'note.text', android: 'description', web: 'description' }} size={40} tintColor={palette.ocean} /></View>
        <Text style={styles.emptyTitle}>旅のメモ</Text>
        <Text style={styles.muted}>思いついたことを、自由に。</Text>
        {canEdit ? <Pressable accessibilityRole="button" onPress={add} style={styles.primary}><Text style={styles.primaryText}>メモを書く</Text></Pressable> : null}
      </View> : !filtered.length ? <View style={styles.empty}><Text style={styles.emptyTitle}>メモが見つかりません</Text><Pressable accessibilityRole="button" onPress={() => setSearch('')} style={styles.control}><Text style={styles.actionText}>検索をクリア</Text></Pressable></View> : <View style={styles.list}>
        {filtered.map((note, index) => <Pressable accessibilityRole="button" accessibilityLabel={`${titleOf(note.body)}を開く`} key={note.id} onPress={(event) => { setDetailOrigin(captureDetailOrigin(event)); setEditing(note); }} style={[styles.row, index > 0 && styles.divider]}>
          <View style={styles.rowHeading}><Text numberOfLines={1} style={styles.rowTitle}>{titleOf(note.body)}</Text>{note.pinned ? <SymbolView name={{ ios: 'pin.fill', android: 'push_pin', web: 'push_pin' }} size={16} tintColor={palette.ocean} /> : null}</View>
          <View style={styles.preview}><Text style={styles.date}>{dateOf(note.updatedAt)}</Text><Text numberOfLines={1} style={styles.snippet}>{note.body.trim().split('\n').slice(1).filter(Boolean).join(' ') || '本文なし'}</Text></View>
        </Pressable>)}
      </View>}
      {notes.length ? <Text style={styles.count}>{filtered.length}件のメモ</Text> : null}
    </ScrollView>
    {canEdit ? <FloatingAddButton label="メモを書く" onPress={add} /> : null}
    <MotionPresence>{editing ? <NoteEditor detailOrigin={detailOrigin} key={editing.id} initial={editing} onClose={() => setEditing(null)} /> : null}</MotionPresence>
  </View>;
}

function NoteEditor({ initial, onClose, detailOrigin }: { detailOrigin?: DetailOrigin; initial: TravelNote; onClose: () => void }) {
  const palette = usePalette();
  const styles = useThemedStyles(createStyles);
  const viewport = useModalViewport();
  const { saveNote, deleteNote, canEdit, error, pendingCount, notes, selectedTrip } = useTravel();
  const tripId = useRef(selectedTrip?.id);
  const [draft, setDraft] = useState(initial);
  const [dirty, setDirty] = useState(false);
  const draftRef = useRef(initial);
  const dirtyRef = useRef(false);
  const exists = useRef(notes.some((note) => note.id === initial.id));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const input = useRef<TextInput>(null);
  const selection = useRef({ start: 0, end: 0 });
  const actions = useRef({ saveNote, canEdit });
  useEffect(() => { actions.current = { saveNote, canEdit }; }, [saveNote, canEdit]);
  const flush = () => {
    if (timer.current) clearTimeout(timer.current);
    if (!dirtyRef.current || !actions.current.canEdit) return;
    const note = draftRef.current;
    if (note.body.trim() || exists.current) {
      actions.current.saveNote(note.id, { body: note.body, pinned: note.pinned }, tripId.current);
      exists.current = true;
    }
    dirtyRef.current = false;
  };
  const flushRef = useRef(flush);
  useEffect(() => { flushRef.current = flush; });
  useEffect(() => {
    const listener = AppState.addEventListener('change', (state) => { if (state !== 'active') flushRef.current(); });
    const persist = () => flushRef.current();
    if (Platform.OS === 'web') globalThis.addEventListener?.('pagehide', persist);
    return () => { listener.remove(); if (Platform.OS === 'web') globalThis.removeEventListener?.('pagehide', persist); flushRef.current(); };
  }, []);
  const change = (next: TravelNote) => {
    draftRef.current = next; dirtyRef.current = true; setDraft(next); setDirty(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { flushRef.current(); setDirty(false); }, 500);
  };
  const close = () => { flush(); onClose(); };
  const remove = () => confirmDeletion('このメモを削除しますか？', titleOf(draft.body), () => {
    if (timer.current) clearTimeout(timer.current);
    dirtyRef.current = false;
    if (exists.current) deleteNote(initial.id);
    onClose();
  });
  const checklist = () => {
    const { start } = selection.current;
    const body = draftRef.current.body;
    const lineStart = body.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
    const line = body.slice(lineStart);
    const marker = line.startsWith('☐ ') ? '☑ ' : line.startsWith('☑ ') ? '☐ ' : '☐ ';
    const skip = /^[☐☑] /.test(line) ? 2 : 0;
    const next = body.slice(0, lineStart) + marker + line.slice(skip);
    if (next.length > 50000) return;
    change({ ...draftRef.current, body: next });
    input.current?.focus();
  };
  return <MotionModal detailOrigin={detailOrigin} transparent={Platform.OS === 'web'} visible animationType="slide" onRequestClose={close}>
    <SafeAreaView testID="note-modal-viewport" style={[styles.editorBackdrop, viewport]}>
      <KeyboardAvoidingView testID="note-editor" behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.editor}>
        <View style={styles.editorToolbar}>
          <Pressable accessibilityRole="button" onPress={close} style={styles.control}><Text style={styles.actionText}>‹ メモ</Text></Pressable>
          <View style={styles.tools}>
            {canEdit ? <Pressable accessibilityRole="button" accessibilityLabel={draft.pinned ? 'ピン留めを解除' : 'ピン留め'} accessibilityState={{ selected: draft.pinned }} onPress={() => change({ ...draftRef.current, pinned: !draftRef.current.pinned })} style={styles.control}><SymbolView name={{ ios: draft.pinned ? 'pin.fill' : 'pin', android: 'push_pin', web: 'push_pin' }} size={22} tintColor={draft.pinned ? palette.ocean : palette.smoke} /></Pressable> : null}
            {canEdit ? <Pressable accessibilityRole="button" accessibilityLabel="メモを削除" onPress={remove} style={styles.control}><SymbolView name={{ ios: 'trash', android: 'delete', web: 'delete' }} size={22} tintColor={palette.ocean} /></Pressable> : null}
            <Pressable accessibilityRole="button" onPress={close} style={styles.control}><Text style={styles.done}>完了</Text></Pressable>
          </View>
        </View>
        <Text style={styles.editorDate}>{dateOf(initial.updatedAt)}</Text>
        <TextInput testID="note-body" ref={input} accessibilityLabel="メモ本文" autoFocus={!initial.body && canEdit} editable={canEdit} value={draft.body} multiline textAlignVertical="top" scrollEnabled maxLength={50000} onChangeText={(body) => change({ ...draftRef.current, body })} onSelectionChange={(event) => { selection.current = event.nativeEvent.selection; }} onBlur={() => { flush(); setDirty(false); }} placeholder="メモを書く" placeholderTextColor={palette.placeholder} style={styles.body} />
        <View style={styles.editorFooter}>
          {canEdit ? <Pressable accessibilityRole="button" accessibilityLabel="この行をチェックリストにする・チェックを切り替える" onPress={checklist} style={styles.control}><SymbolView name={{ ios: 'checklist', android: 'checklist', web: 'checklist' }} size={24} tintColor={palette.ocean} /></Pressable> : null}
          <Text accessibilityLiveRegion="polite" style={[styles.saveState, error ? { color: palette.danger } : null]}>{error || (dirty ? '保存中…' : pendingCount ? '端末に保存済み · 同期待ち' : '自動保存')}</Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  </MotionModal>;
}

const createStyles = (palette: Palette) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.canvas },
  content: { width: '100%', maxWidth: 800, alignSelf: 'center', paddingHorizontal: 20, paddingBottom: 110, gap: 20 },
  search: { minHeight: 48, borderRadius: 12, backgroundColor: palette.mist, color: palette.ink, paddingHorizontal: 16, fontSize: 16 },
  list: { borderRadius: 18, backgroundColor: palette.paper, paddingHorizontal: 20 },
  row: { paddingVertical: 20, gap: 8, minHeight: 90 }, divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.ash },
  rowHeading: { flexDirection: 'row', alignItems: 'center', gap: 12 }, rowTitle: { flex: 1, fontSize: 18, lineHeight: 25, fontWeight: '700', color: palette.ink },
  preview: { flexDirection: 'row', gap: 12 }, date: { color: palette.slate, fontSize: 13, lineHeight: 20 }, snippet: { flex: 1, color: palette.smoke, fontSize: 14, lineHeight: 20 },
  count: { textAlign: 'center', fontSize: 12, color: palette.smoke },
  empty: { alignItems: 'center', paddingVertical: 64, gap: 18 }, emptyIcon: { width: 88, height: 88, borderRadius: 24, backgroundColor: palette.sky, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 22, fontWeight: '700', color: palette.ink }, muted: { fontSize: 14, color: palette.slate },
  primary: { minHeight: 48, borderRadius: 12, backgroundColor: palette.ocean, paddingHorizontal: 24, justifyContent: 'center', marginTop: 8 }, primaryText: { color: palette.onOcean, fontSize: 15, fontWeight: '700' },
  editorBackdrop: { flex: 1, backgroundColor: Platform.OS === 'web' ? 'rgba(24,42,54,0.3)' : palette.paper }, editor: { backgroundColor: palette.paper, flex: 1, width: '100%', maxWidth: 860, alignSelf: 'center' },
  editorToolbar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 12, minHeight: 56 }, tools: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  control: { minHeight: 44, minWidth: 44, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' }, actionText: { color: palette.ocean, fontSize: 17 }, done: { fontSize: 17, fontWeight: '700', color: palette.ocean },
  editorDate: { textAlign: 'center', color: palette.smoke, fontSize: 12, marginVertical: 10 },
  body: { flex: 1, paddingHorizontal: 24, paddingVertical: 14, color: palette.ink, backgroundColor: palette.paper, fontSize: 18, lineHeight: 30, textAlignVertical: 'top' },
  editorFooter: { minHeight: 52, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.ash }, saveState: { flex: 1, textAlign: 'right', fontSize: 12, color: palette.smoke, paddingHorizontal: 10 },
});
