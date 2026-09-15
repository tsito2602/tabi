import { useContext, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, usePathname } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { captureDetailOrigin, type DetailOrigin } from '@/utils/detail-origin';
import { closeTripTransition } from '@/utils/trip-transition';
import { usePalette, useThemedStyles } from '@/theme/theme-provider';
import { useModalViewport } from '@/hooks/use-modal-viewport';
import { useDesktop } from '@/hooks/use-desktop';
import { useTravel } from '@/data/travel-provider';
import { type Palette } from '@/constants/design';
import { MotionPresence } from './motion-presence';
import { MotionTabs } from './motion-tabs';
import { MotionModal } from './motion-modal';
import { PageActionContext } from './page-action-context';
import { TripEditor } from './trip-editor';
import { DeleteTripDialog } from './delete-trip-dialog';
import { SyncStatus } from './sync-status';
import { useOfflineTrip } from './offline-trip';
import { useToast } from './toast';
import { ActionButton } from './ui/action-button';
import { tripNavigation } from './trip-navigation';

export function TripTopTabs({ tripId }: { tripId: string }) {
  const p = usePalette(), s = useThemedStyles(createStyles);
  const pathname = usePathname(), desktop = useDesktop(), insets = useSafeAreaInsets();
  const { action } = useContext(PageActionContext);
  const { selectedTrip, deleteTrip } = useTravel();
  const [editing, setEditing] = useState(false), [origin, setOrigin] = useState<DetailOrigin>();
  const [menu, setMenu] = useState(false), [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false), [deleteError, setDeleteError] = useState('');
  const viewport = useModalViewport(menu), offline = useOfflineTrip(), toast = useToast();
  const managing = pathname.endsWith('/members'), canEdit = selectedTrip?.role !== 'viewer';
  const tabScroll = useRef<ScrollView>(null), tabLayouts = useRef<Record<string, { x: number; width: number }>>({});
  const [tabWidth, setTabWidth] = useState(0);
  const revealTab = () => {
    const frame = tabLayouts.current[pathname.split('/').pop() ?? ''];
    if (frame) tabScroll.current?.scrollTo({ x: Math.max(0, frame.x - (tabWidth - frame.width) / 2), animated: false });
  };
  useEffect(revealTab, [pathname, tabWidth]);
  const remove = async () => {
    if (deleting) return;
    setDeleting(true); setDeleteError('');
    try { await deleteTrip(tripId); setConfirmDelete(false); router.replace('/'); toast('旅行を削除しました'); }
    catch (cause) { setDeleteError(cause instanceof Error ? cause.message : '削除できませんでした'); }
    finally { setDeleting(false); }
  };
  return <View testID="trip-header" style={[s.shell, { paddingTop: insets.top }]}>
    <View testID="trip-header-inner" style={s.inner}>
      <View style={s.topRow}>
        <Pressable testID="trip-back" accessibilityRole="button" accessibilityLabel={managing ? 'しおりへ戻る' : '旅行一覧へ戻る'}
          onPress={() => managing ? router.replace({ pathname: '/trips/[tripId]/itinerary', params: { tripId } }) : closeTripTransition(tripId, () => router.replace('/'))} style={s.backButton}><Text style={s.backMark}>‹</Text></Pressable>
        <View testID="trip-heading" style={s.title}><Text testID="trip-name" accessibilityRole="header" numberOfLines={1} style={s.tripName}>{managing ? 'メンバー' : selectedTrip?.name}</Text><Text style={s.tripDates}>{managing ? selectedTrip?.name : `${selectedTrip?.startsOn.replaceAll('-', '.')} — ${selectedTrip?.endsOn.replaceAll('-', '.')}`}</Text></View>
        {desktop && action ? <View style={s.pageAction}><ActionButton testID="desktop-page-action" accessibilityLabel={action.label} label={action.label.replace(/する$/, '')} onPress={action.run} /></View> : null}
        <Pressable accessibilityRole="button" accessibilityLabel="旅行メニュー" onPress={() => setMenu(true)} style={s.menuButton}><Text style={s.menuMark}>⋯</Text></Pressable>
      </View>
      {!managing ? <><SyncStatus /><ScrollView testID="trip-tabs" ref={tabScroll} horizontal showsHorizontalScrollIndicator={false} onLayout={e => setTabWidth(e.nativeEvent.layout.width)} onContentSizeChange={revealTab} style={s.tabScroll} contentContainerStyle={{ flexGrow: 1 }} accessibilityRole="tablist">
        <MotionTabs style={s.tabs}>{tripNavigation.map(tab => {
          const selected = pathname.endsWith(`/${tab.key}`);
          return <Pressable key={tab.key} accessibilityRole="tab" accessibilityLabel={tab.accessibilityLabel ?? tab.label} aria-selected={selected} accessibilityState={{ selected }}
            onLayout={e => { tabLayouts.current[tab.key] = e.nativeEvent.layout; if (selected) revealTab(); }}
            onPress={() => router.replace({ pathname: `/trips/[tripId]/${tab.key}`, params: { tripId } })} style={[s.tab, selected && s.tabSelected]}><Text numberOfLines={1} style={[s.tabText, selected && s.tabTextSelected]}>{tab.label}</Text></Pressable>;
        })}</MotionTabs>
      </ScrollView></> : null}
      {offline.busy ? <Text style={s.progress}>{offline.progress}</Text> : null}
    </View>
    <MotionModal motion="dropdown" visible={menu} transparent animationType="fade" onRequestClose={() => setMenu(false)}>
      <View testID="modal-viewport" style={[s.menuOverlay, viewport]}>
        <Pressable accessibilityLabel="メニューを閉じる" onPress={() => setMenu(false)} style={StyleSheet.absoluteFill} />
        <View testID="trip-menu-position" style={[s.menuPosition, { top: insets.top + 58 }]} pointerEvents="box-none"><View testID="trip-menu" style={s.menu}>
          {!managing ? <Pressable accessibilityRole="button" accessibilityLabel="メンバーを管理" onPress={() => { setMenu(false); router.push({ pathname: '/trips/[tripId]/members', params: { tripId } }); }} style={s.menuRow}><SymbolView name={{ ios: 'person.2', android: 'group', web: 'group' }} size={19} tintColor={p.smoke} /><Text style={s.menuText}>メンバーを管理</Text></Pressable> : null}
          {canEdit ? <Pressable accessibilityRole="button" onPress={e => { setOrigin(captureDetailOrigin(e)); setMenu(false); setEditing(true); }} style={s.menuRow}><SymbolView name={{ ios: 'pencil', android: 'edit', web: 'edit' }} size={19} tintColor={p.smoke} /><Text style={s.menuText}>旅行を編集</Text></Pressable> : null}
          {Platform.OS === 'web' ? <Pressable accessibilityRole="button" disabled={offline.busy} onPress={() => { setMenu(false); void offline.save(); }} style={s.menuRow}><SymbolView name={{ ios: 'arrow.down.circle', android: 'download', web: 'download' }} size={19} tintColor={p.smoke} /><Text style={s.menuText}>{offline.busy ? offline.progress : 'オフライン保存'}</Text></Pressable> : null}
          {selectedTrip?.role === 'owner' ? <Pressable accessibilityRole="button" onPress={() => { setMenu(false); setDeleteError(''); setConfirmDelete(true); }} style={[s.menuRow, s.deleteRow]}><SymbolView name={{ ios: 'trash', android: 'delete', web: 'delete' }} size={19} tintColor={p.danger} /><Text style={[s.menuText, { color: p.danger }]}>旅行を削除</Text></Pressable> : null}
        </View></View>
      </View>
    </MotionModal>
    <MotionPresence>{editing && selectedTrip ? <TripEditor detailOrigin={origin} trip={selectedTrip} onClose={() => setEditing(false)} /> : null}</MotionPresence>
    <DeleteTripDialog visible={confirmDelete} name={selectedTrip?.name ?? ''} busy={deleting} error={deleteError} onCancel={() => setConfirmDelete(false)} onConfirm={() => void remove()} />
  </View>;
}
const createStyles = (p: Palette) => StyleSheet.create({
  shell: { width: '100%', backgroundColor: Platform.OS === 'web' ? p.glass : p.glassNative },
  inner: { width: '100%', maxWidth: 800, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 0 },
  topRow: { minHeight: 60, justifyContent: 'center', position: 'relative' },
  backButton: { position: 'absolute', left: 0, width: 44, height: 48, justifyContent: 'center' }, backMark: { color: p.ink, fontSize: 32, lineHeight: 36 },
  title: { marginLeft: 44, marginRight: 44, minHeight: 56, justifyContent: 'center', alignItems: 'center' },
  tripName: { color: p.ink, fontSize: 17, lineHeight: 24, fontWeight: '600' }, tripDates: { color: p.smoke, fontSize: 11, lineHeight: 17, marginTop: 3 },
  menuButton: { position: 'absolute', right: 0, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }, menuMark: { color: p.ink, fontSize: 26, fontWeight: '600' },
  pageAction: { position: 'absolute', right: 56 }, tabScroll: { marginHorizontal: -20, flexGrow: 0 },
  tabs: { minHeight: 48, flexDirection: 'row', paddingHorizontal: 20, gap: 4, alignItems: 'center' },
  tab: { flex: 1, flexShrink: 0, minWidth: 60, paddingHorizontal: 12, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabSelected: { borderBottomColor: p.ocean }, tabText: { color: p.smoke, fontSize: 14, lineHeight: 21, fontWeight: '500' }, tabTextSelected: { color: p.ocean, fontWeight: '700' },
  progress: { color: p.ocean, fontSize: 12, paddingVertical: 8, textAlign: 'right' },
  menuOverlay: { flex: 1, backgroundColor: p.overlay }, menuPosition: { position: 'absolute', width: '100%', maxWidth: 800, alignSelf: 'center', paddingHorizontal: 20, alignItems: 'flex-end' },
  menu: { width: 248, borderRadius: 20, padding: 6, backgroundColor: p.paper }, menuRow: { minHeight: 48, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 12 },
  menuText: { color: p.ink, fontSize: 14, fontWeight: '500' }, deleteRow: { borderRadius: 0, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: p.ash },
});
