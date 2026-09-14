import { MotionPresence } from '@/components/motion-presence';
import { MotionTabs } from './motion-tabs';
import { MotionModal } from './motion-modal';
import { usePalette, useThemedStyles } from '@/theme/theme-provider';
import { useModalViewport } from '@/hooks/use-modal-viewport';
import { router, usePathname } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useContext, useEffect, useRef, useState } from 'react';
import { PageActionContext } from './page-action-context';
import { useDesktop } from '@/hooks/use-desktop';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TripEditor } from './trip-editor';
import { DeleteTripDialog } from './delete-trip-dialog';
import { SyncStatus } from './sync-status';
import { useOfflineTrip } from './offline-trip';
import { useToast } from './toast';
import { type Palette } from '@/constants/design';
import { useTravel } from '@/data/travel-provider';

const tabs = [
  { key: 'itinerary', label: 'しおり' },
  { key: 'places', label: '行きたい場所' },
  { key: 'packing', label: '準備' },
  { key: 'bookings', label: '予約' },
  { key: 'notes', label: 'メモ' },
] as const;

export function TripTopTabs({ tripId }: { tripId: string }) {
  const palette = usePalette();
  const styles = useThemedStyles(createStyles);

  const pathname = usePathname();
  const tabScroll = useRef<ScrollView>(null);
  const tabLayouts = useRef<Record<string, { x: number; width: number }>>({});
  const [tabWidth, setTabWidth] = useState(0);
  const revealTab = () => {
    const frame = tabLayouts.current[pathname.split('/').pop() ?? ''];
    if (frame) tabScroll.current?.scrollTo({ x: Math.max(0, frame.x - (tabWidth - frame.width) / 2), animated: false });
  };
  useEffect(revealTab, [pathname, tabWidth]);
  const desktop = useDesktop();
  const { action } = useContext(PageActionContext);
  const managing = pathname.endsWith('/members');
  const { selectedTrip, deleteTrip } = useTravel();
  const [editing, setEditing] = useState(false);
  const [menu, setMenu] = useState(false);
  const viewport = useModalViewport(menu);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const offline = useOfflineTrip();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const canEdit = selectedTrip?.role !== 'viewer';
  const remove = async () => {
    if (deleting) return;
    setDeleting(true); setDeleteError('');
    try { await deleteTrip(tripId); setConfirmDelete(false); router.replace('/'); toast('旅行を削除しました'); }
    catch (cause) { setDeleteError(cause instanceof Error ? cause.message : '削除できませんでした'); }
    finally { setDeleting(false); }
  };
  return <View testID="trip-header" style={styles.shell}>
    <View testID="trip-header-inner" style={styles.inner}>
      <View style={styles.topRow}>
        <Pressable accessibilityRole="button" accessibilityLabel={managing ? 'しおりへ戻る' : '旅行一覧へ戻る'} onPress={() => managing ? router.replace({ pathname: '/trips/[tripId]/itinerary', params: { tripId } }) : router.replace('/')} testID="trip-back" style={styles.backButton}><Text style={styles.backMark}>‹</Text></Pressable>
        <View testID="trip-heading" style={styles.title}><Text numberOfLines={1} style={styles.tripName}>{managing ? 'メンバー' : selectedTrip?.name}</Text><Text style={styles.tripDates}>{managing ? selectedTrip?.name : `${selectedTrip?.startsOn.replaceAll('-', '.')} — ${selectedTrip?.endsOn.replaceAll('-', '.')}`}</Text></View>
        {desktop && action ? <Pressable testID="desktop-page-action" accessibilityRole="button" accessibilityLabel={action.label} onPress={action.run} style={{ position: 'absolute', right: 56, paddingHorizontal: 18, height: 44, borderRadius: 10, backgroundColor: palette.ocean, justifyContent: 'center' }}><Text style={{ color: palette.onOcean, fontSize: 14, fontWeight: '700' }}>＋ {action.label.replace(/する$/, '')}</Text></Pressable> : null}
        <Pressable accessibilityRole="button" accessibilityLabel="旅行メニュー" onPress={() => setMenu(true)} style={styles.menuButton}><Text style={styles.menuMark}>⋯</Text></Pressable>
      </View>
      {!managing ? <>
        <SyncStatus />
        <ScrollView testID="trip-tabs" ref={tabScroll} horizontal showsHorizontalScrollIndicator={false} onLayout={(event) => setTabWidth(event.nativeEvent.layout.width)} onContentSizeChange={revealTab} style={styles.tabScroll} contentContainerStyle={{ flexGrow: 1 }} accessibilityRole="tablist"><MotionTabs style={styles.tabs}>{tabs.map((tab) => {
          const selected = pathname.endsWith(`/${tab.key}`);
          return <Pressable accessibilityRole="tab" aria-selected={selected} accessibilityState={{ selected }} onLayout={(event) => { tabLayouts.current[tab.key] = event.nativeEvent.layout; if (selected) revealTab(); }} key={tab.key} onPress={() => router.replace({ pathname: `/trips/[tripId]/${tab.key}`, params: { tripId } })} style={[styles.tab, selected && styles.tabSelected]}><Text numberOfLines={1} style={[styles.tabText, selected && styles.tabTextSelected]}>{tab.label}</Text></Pressable>;
        })}</MotionTabs></ScrollView>
      </> : null}
      {offline.busy ? <Text style={styles.progress}>{offline.progress}</Text> : null}
    </View>
    <MotionModal motion="dropdown" visible={menu} transparent animationType="fade" onRequestClose={() => setMenu(false)}>
      <View testID="modal-viewport" style={[styles.menuOverlay, viewport]}>
        <Pressable accessibilityLabel="メニューを閉じる" onPress={() => setMenu(false)} style={StyleSheet.absoluteFill} />
        <View testID="trip-menu-position" style={[styles.menuPosition, { top: insets.top + 58 }]} pointerEvents="box-none">
          <View testID="trip-menu" style={styles.menu}>
            {!managing ? <Pressable accessibilityRole="button" accessibilityLabel="メンバーを管理" onPress={() => { setMenu(false); router.push({ pathname: '/trips/[tripId]/members', params: { tripId } }); }} style={styles.menuRow}><SymbolView name={{ ios: 'person.2', android: 'group', web: 'group' }} size={19} tintColor={palette.ocean} /><Text style={styles.menuText}>メンバーを管理</Text></Pressable> : null}
            {canEdit ? <Pressable accessibilityRole="button" onPress={() => { setMenu(false); setEditing(true); }} style={styles.menuRow}><SymbolView name={{ ios: 'pencil', android: 'edit', web: 'edit' }} size={19} tintColor={palette.ocean} /><Text style={styles.menuText}>旅行を編集</Text></Pressable> : null}
            {Platform.OS === 'web' ? <Pressable accessibilityRole="button" disabled={offline.busy} onPress={() => { setMenu(false); void offline.save(); }} style={styles.menuRow}><SymbolView name={{ ios: 'arrow.down.circle', android: 'download', web: 'download' }} size={19} tintColor={palette.ocean} /><Text style={styles.menuText}>{offline.busy ? offline.progress : 'オフライン保存'}</Text></Pressable> : null}
            {selectedTrip?.role === 'owner' ? <Pressable accessibilityRole="button" onPress={() => { setMenu(false); setDeleteError(''); setConfirmDelete(true); }} style={[styles.menuRow, styles.deleteRow]}><SymbolView name={{ ios: 'trash', android: 'delete', web: 'delete' }} size={19} tintColor={palette.danger} /><Text style={[styles.menuText, { color: palette.danger }]}>旅行を削除</Text></Pressable> : null}
          </View>
        </View>
      </View>
    </MotionModal>
    <MotionPresence>{editing && selectedTrip ? <TripEditor trip={selectedTrip} onClose={() => setEditing(false)} /> : null}</MotionPresence>
    <DeleteTripDialog visible={confirmDelete} name={selectedTrip?.name ?? ''} busy={deleting} error={deleteError} onCancel={() => setConfirmDelete(false)} onConfirm={() => void remove()} />
  </View>;
}
const createStyles = (palette: Palette) => StyleSheet.create({
  shell: { width: '100%', backgroundColor: Platform.OS === 'web' ? palette.glass : palette.glassNative },
  inner: { width: '100%', maxWidth: 800, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 10 },
  topRow: { minHeight: 64, justifyContent: 'center', position: 'relative' },
  backButton: { position: 'absolute', left: 0, width: 40, height: 48, justifyContent: 'center' },
  backMark: { color: palette.ocean, fontSize: 32, lineHeight: 36 },
  title: { marginLeft: 42, marginRight: 48, minHeight: 60, justifyContent: 'center' },
  tripName: { color: palette.ink, fontSize: 16, lineHeight: 22, fontWeight: '800' },
  tripDates: { color: palette.slate, fontSize: 10, marginTop: 4 },
  menuButton: { position: 'absolute', right: 0, width: 40, height: 44, alignItems: 'center', justifyContent: 'center' },
  menuMark: { color: palette.ocean, fontSize: 26, fontWeight: '800' },
  tabScroll: { marginHorizontal: -20, flexGrow: 0 },
  tabs: { minHeight: 54, flexDirection: 'row', paddingHorizontal: 20, gap: 8, alignItems: 'center' },
  tab: { flexShrink: 0, minWidth: 76, paddingHorizontal: 20, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  tabSelected: { backgroundColor: palette.sky },
  tabText: { color: palette.slate, fontSize: 12, lineHeight: 20, fontWeight: '700' },
  tabTextSelected: { color: palette.ink, fontWeight: '900' },
  progress: { color: palette.ocean, fontSize: 11, paddingTop: 8, textAlign: 'right' },
  menuOverlay: { flex: 1, backgroundColor: 'rgba(18,35,45,0.16)' },
  menuPosition: { position: 'absolute', width: '100%', maxWidth: 800, alignSelf: 'center', paddingHorizontal: 20, alignItems: 'flex-end' },
  menu: { width: 236, borderRadius: 18, padding: 6, backgroundColor: palette.paper },
  menuRow: { minHeight: 52, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 12 },
  menuText: { color: palette.ink, fontSize: 14, fontWeight: '600' },
  deleteRow: { borderRadius: 0, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.ash },
});
