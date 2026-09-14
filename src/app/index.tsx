import { getTripListSearch, openTripTransition, rememberTripListSearch } from '@/utils/trip-transition';
import { MotionPage } from '@/components/motion-page';
import { MotionPresence } from '@/components/motion-presence';
import { usePalette, useThemedStyles } from '@/theme/theme-provider';
import { MemberAvatar } from '@/components/member-avatar';
import { useDesktop } from '@/hooks/use-desktop';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/auth/auth-provider';
import { SyncStatus } from '@/components/sync-status';
import { TripEditor } from '@/components/trip-editor';
import { TripTicket } from '@/components/trip-ticket';
import { type Palette } from '@/constants/design';
import { useTravel } from '@/data/travel-provider';
import { localDate } from '@/utils/dates';

export default function HomeScreen() {
  const palette = usePalette();
  const styles = useThemedStyles(createStyles);

  const desktop = useDesktop();
  const [search, setSearch] = useState(getTripListSearch);
  const { invite } = useLocalSearchParams<{ invite?: string | string[] }>();
  const { trips, selectTrip, acceptInvite, ready, syncing, sync } = useTravel();
  const { isDemo, user } = useAuth();
  const acceptingInvite = useRef(false);
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState('');
  useEffect(() => {
    const token = Array.isArray(invite) ? invite[0] : invite;
    if (!ready || !token || acceptingInvite.current || isDemo) return;
    acceptingInvite.current = true;
    void acceptInvite(token).then(() => setNotice('旅行に参加しました')).catch((cause) => setNotice(cause instanceof Error ? cause.message : '招待リンクを確認してください')).finally(() => router.replace('/'));
  }, [acceptInvite, invite, ready, isDemo]);
  const openTrip = (tripId: string) => {
    openTripTransition(tripId, () => {
      selectTrip(tripId);
      router.push({ pathname: '/trips/[tripId]/itinerary', params: { tripId } });
    });
  };
  const today = localDate();
  const matchingTrips = trips.filter((trip) => `${trip.name} ${trip.destination}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const groups = [{ label: 'これからの旅行', trips: matchingTrips.filter((trip) => trip.endsOn >= today).sort((a,b) => a.startsOn.localeCompare(b.startsOn)) }, { label: 'これまでの旅行', trips: matchingTrips.filter((trip) => trip.endsOn < today).sort((a,b) => b.startsOn.localeCompare(a.startsOn)) }];
  return <MotionPage><SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
    <ScrollView nativeID={ready ? "trip-list-ready" : undefined} testID="home-scroll" contentContainerStyle={styles.content} refreshControl={!isDemo ? <RefreshControl refreshing={syncing} onRefresh={() => void sync()} tintColor={palette.ocean} /> : undefined}>
      <View testID="home-header" style={styles.header}>
        <View><Text style={styles.eyebrow}>TABI</Text><Text accessibilityRole="header" style={styles.title}>旅行</Text></View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><Pressable accessibilityRole="button" accessibilityLabel="設定を開く" onPress={() => router.push('/settings')} style={{ padding: 4 }}><MemberAvatar name={user?.name || 'あなた'} avatarUrl={user?.avatarUrl} size={36} /></Pressable><Pressable accessibilityRole="button" accessibilityLabel="旅行を追加する" disabled={!ready} onPress={() => setCreating(true)} style={({ pressed }) => [styles.add, pressed && styles.pressed]}><Text style={styles.addText}>＋ 旅行</Text></Pressable></View>
      </View>
      {desktop && trips.length ? <TextInput accessibilityLabel="旅行を検索" placeholder="旅行名・行き先で検索" placeholderTextColor={palette.placeholder} value={search} onChangeText={(value) => { rememberTripListSearch(value); setSearch(value); }} style={{ padding: 14, backgroundColor: palette.paper, borderRadius: 10, color: palette.ink, fontSize: 14, marginVertical: 16, maxWidth: 420 }} /> : null}
      {desktop && trips.length > 0 && !matchingTrips.length ? <Text style={styles.notice}>該当する旅行がありません</Text> : null}
      <SyncStatus />
      {notice ? <Text accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text> : null}
      {!ready ? <View style={styles.loading}><ActivityIndicator color={palette.ocean} /></View> : !trips.length ? <View style={styles.empty}>
        <View style={styles.emptyTicket}><Text style={styles.emptyTicketText}>TABI / 01</Text><View style={styles.perforation} /><Text style={styles.emptyPlus}>＋</Text></View>
        <Text style={styles.emptyTitle}>最初の旅行を作成</Text>
        <Text style={styles.body}>行き先と日程が決まったら、旅行を作成できます。</Text>
        <Pressable accessibilityRole="button" onPress={() => setCreating(true)} style={styles.primary}><Text style={styles.addText}>旅行を作る</Text></Pressable>
      </View> : groups.filter((group) => group.trips.length).map((group) => <View key={group.label} style={styles.group}>
        <Text style={styles.groupTitle}>{group.label}<Text style={styles.count}>　{group.trips.length}</Text></Text>
        <View testID="trip-grid" style={{ gap: 18 }}>{group.trips.map((trip) => <Pressable key={trip.id} accessibilityRole="button" accessibilityLabel={trip.name} accessibilityHint="旅行のしおりを開きます" onPress={() => openTrip(trip.id)} style={({pressed}) => [pressed && styles.pressed]}><TripTicket trip={trip} /></Pressable>)}</View>
      </View>)}
    </ScrollView>
    <MotionPresence>{creating ? <TripEditor onClose={() => setCreating(false)} onSaved={openTrip} /> : null}</MotionPresence>
  </SafeAreaView></MotionPage>;
}
const createStyles = (palette: Palette) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.canvas }, content: { width: '100%', maxWidth: 800, alignSelf: 'center', padding: 20, paddingBottom: 32 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }, eyebrow: { color: palette.ocean, fontSize: 11, fontWeight: '700', letterSpacing: 2, marginBottom: 8 }, title: { color: palette.ink, fontSize: 36, lineHeight: 44, fontWeight: '800', letterSpacing: -1 },
  add: { minHeight: 48, paddingHorizontal: 18, borderRadius: 12, backgroundColor: palette.ocean, justifyContent: 'center' }, addText: { color: palette.onOcean, fontSize: 15, fontWeight: '700' }, pressed: { opacity: 0.72, transform: [{ scale: 0.99 }] },
  group: { gap: 18, marginTop: 24 }, groupTitle: { color: palette.slate, fontSize: 13, fontWeight: '600' }, count: { color: palette.ocean },
  notice: { color: palette.ocean, paddingVertical: 12, fontSize: 14 }, loading: { padding: 80 }, empty: { paddingVertical: 56, alignItems: 'center', gap: 12 },
  emptyTicket: { width: 190, height: 90, backgroundColor: palette.paper, borderRadius: 18, transform: [{ rotate: '-6deg' }], padding: 18, marginBottom: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, emptyTicketText: { fontSize: 11, color: palette.ocean, letterSpacing: 1 }, perforation: { height: 64, borderLeftWidth: 1, borderStyle: 'dashed', borderColor: palette.ash }, emptyPlus: { color: palette.ocean, fontSize: 28 },
  emptyTitle: { color: palette.ink, fontSize: 23, fontWeight: '700' }, body: { color: palette.slate, fontSize: 14, lineHeight: 22, textAlign: 'center', maxWidth: 270 }, primary: { marginTop: 12, backgroundColor: palette.ocean, padding: 16, borderRadius: 10 },
});
