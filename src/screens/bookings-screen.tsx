import { MotionTabs } from '@/components/motion-tabs';
import { MotionPresence } from '@/components/motion-presence';
import { bookingDurationLabel } from '@/data/booking-duration';
import { usePalette, useThemedStyles } from '@/theme/theme-provider';
import { PageHeading } from '@/components/page-heading';
import { useTripHeaderHeight } from '@/components/trip-header-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/auth/auth-provider';
import { BookingSheet, BOOKING_KINDS } from '@/components/booking-sheet';
import { BookingRoute } from '@/components/booking-route';
import { FloatingAddButton } from '@/components/floating-add-button';
import { FlightConnectionLink, FlightConnectionSheet } from '@/components/flight-connection-sheet';
import { mono, type Palette } from '@/constants/design';
import { findFlightConnections, hasLikelyFlightConnection } from '@/data/flight-connections';
import { useTravel } from '@/data/travel-provider';
import { formatDate } from '@/utils/dates';

export default function BookingsScreen() {
  const { selectedTrip } = useTravel();
  const { user } = useAuth();
  return <TripBookingsScreen key={`${user?.id}:${selectedTrip?.id}:${selectedTrip?.startsOn}:${selectedTrip?.endsOn}`} />;
}

function TripBookingsScreen() {
  const palette = usePalette();
  const styles = useThemedStyles(createStyles);

  const [search, setSearch] = useState('');
  const [kindFilter, setKindFilter] = useState('all');
  const headerHeight = useTripHeaderHeight();
  const { booking: requestedBooking } = useLocalSearchParams<{ booking?: string | string[] }>();
  const { canEdit, bookings, documentsByBooking, selectedTrip } = useTravel();
  const [openedBooking, setOpenedBooking] = useState<string | 'new' | null>(null);
  const [connectionBookingId, setConnectionBookingId] = useState<string | null>(null);
  const connections = useMemo(() => new Map(findFlightConnections(bookings).map((connection) => [connection.arrivalBookingId, connection])), [bookings]);
  const filtered = bookings.filter((booking) => (kindFilter === 'all' || booking.kind === kindFilter) && `${booking.title} ${booking.detail} ${booking.origin} ${booking.destination} ${booking.originCode} ${booking.destinationCode} ${booking.confirmationCode}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const openCreate = () => setOpenedBooking('new');
  const selectedBooking = bookings.find((booking) => booking.id === openedBooking);

  useEffect(() => {
    const bookingId = Array.isArray(requestedBooking) ? requestedBooking[0] : requestedBooking;
    if (!bookingId || !bookings.some((booking) => booking.id === bookingId)) return;
    const timeout = setTimeout(() => {
      setOpenedBooking(bookingId);
      router.setParams({ booking: undefined });
    }, 0);
    return () => clearTimeout(timeout);
  }, [bookings, requestedBooking]);

  return (
    <SafeAreaView style={styles.safeArea} edges={[]}>
      <ScrollView testID="bookings-scroll" contentContainerStyle={[styles.content, { paddingTop: headerHeight + 20 }]} showsVerticalScrollIndicator={false}>
      <PageHeading title="予約" count={`${bookings.length}件`} />
        {bookings.length ? <View testID="booking-filters" style={{ gap: 12 }}><TextInput accessibilityLabel="予約を検索" placeholder="予約名・空港・予約番号で検索" value={search} onChangeText={setSearch} placeholderTextColor={palette.placeholder} style={{ minHeight: 46, padding: 14, backgroundColor: palette.paper, borderRadius: 10, color: palette.ink, fontSize: 14 }} /><MotionTabs accessibilityRole="tablist" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{[{ value: 'all', label: 'すべて' }, ...BOOKING_KINDS.filter((kind) => bookings.some((booking) => booking.kind === kind.value))].map((kind) => <Pressable accessibilityRole="tab" aria-selected={kindFilter === kind.value} key={kind.value} onPress={() => setKindFilter(kind.value)} style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: 9, backgroundColor: kindFilter === kind.value ? palette.sky : palette.paper }}><Text style={{ color: palette.ocean, fontSize: 12, fontWeight: '600' }}>{kind.label}</Text></Pressable>)}</MotionTabs></View> : null}
        {bookings.length > 0 && !filtered.length ? <View style={styles.empty}><Text style={styles.emptyTitle}>該当する予約がありません</Text><Pressable accessibilityRole="button" onPress={() => { setSearch(''); setKindFilter('all'); }} style={{ padding: 18 }}><Text style={{ color: palette.ocean }}>絞り込みを解除</Text></Pressable></View> : null}
        {!selectedTrip ? (
          <View style={styles.empty}><Text style={styles.emptyTitle}>旅行を作成してください</Text><Text style={styles.emptyBody}>予約は選択中の旅行ごとに保存されます。</Text></View>
        ) : bookings.length === 0 ? (
          <Pressable disabled={!canEdit} onPress={openCreate} style={({ pressed }) => [styles.empty, pressed && styles.pressed]}>
            <View style={styles.emptyMark}><Text style={styles.emptyMarkText}>＋</Text></View>
            <Text style={styles.emptyTitle}>予約はまだありません</Text>
            <Text style={styles.emptyBody}>＋ 航空券・ホテル・チケットを追加</Text>
          </Pressable>
        ) : (
          <View testID="booking-grid" style={styles.ticketList}>
            {filtered.map((booking) => {
              const index = bookings.indexOf(booking);
              const kind = BOOKING_KINDS.find((entry) => entry.value === booking.kind) ?? BOOKING_KINDS[BOOKING_KINDS.length - 1];
              const hasRoute = Boolean(booking.origin || booking.destination || booking.originCode || booking.destinationCode);
              const location = booking.location ?? booking.detail;
              const detail = booking.kind === 'hotel' ? (/^https?:\/\//i.test(location.trim()) ? '' : location) : booking.detail;
              const documentCount = documentsByBooking[booking.id]?.length ?? 0;
              const connection = connections.get(booking.id);
              return (
                <View key={booking.id}>
                <Pressable testID="booking-ticket" onPress={() => setOpenedBooking(booking.id)} style={({ pressed }) => [styles.ticket, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={`${booking.title}の詳細`}>
                  <View style={styles.copy}>
                    <View style={styles.ticketTop}>
                      <View style={styles.typeTag}><Text style={styles.type}>{kind.short}</Text></View>
                      <View style={styles.ticketTopMeta}>{documentCount ? <Text style={styles.documentCount}>書類 {documentCount}</Text> : null}<Text style={styles.serial}>TABI/{String(index + 1).padStart(2, '0')}</Text></View>
                    </View>
                    <Text numberOfLines={2} style={styles.cardTitle}>{booking.title}</Text>
                    {hasRoute ? <BookingRoute booking={booking} compact /> : detail ? <Text numberOfLines={2} style={styles.detail}>{detail}</Text> : null}
                    {hasRoute && booking.detail ? <Text numberOfLines={1} style={styles.detail}>{booking.detail}</Text> : null}
                    <Text style={styles.meta}>{formatDate(booking.day)}　{booking.time}{booking.endDay !== booking.day ? ` → ${formatDate(booking.endDay)}` : booking.endTime && booking.endTime !== booking.time ? ` – ${booking.endTime}` : ''}</Text>
                    {bookingDurationLabel(booking) ? <Text style={styles.meta}>{bookingDurationLabel(booking)}</Text> : null}
                  </View>
                  <View testID="ticket-stub" style={styles.stub}>
                    <Text style={styles.icon}>{kind.icon}</Text>
                    <Text style={styles.stubNo}>{String(index + 1).padStart(2, '0')}</Text>
                    <Text style={styles.stubLabel}>PASS</Text>
                  </View>
                  <View style={[styles.notch, styles.notchTop]} />
                  <View style={[styles.notch, styles.notchBottom]} />
                </Pressable>
                {booking.kind === 'flight' && (connection || (canEdit && hasLikelyFlightConnection(booking, bookings))) ? <FlightConnectionLink disabled={!canEdit} booking={booking} connection={connection} nextFlight={bookings.find((flight) => flight.id === connection?.departureBookingId)} onPress={() => setConnectionBookingId(booking.id)} /> : null}
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {selectedTrip && canEdit ? <FloatingAddButton label="予約を追加する" onPress={openCreate} /> : null}
      <MotionPresence>{connectionBookingId ? <FlightConnectionSheet bookingId={connectionBookingId} onClose={() => setConnectionBookingId(null)} /> : null}</MotionPresence>

      <MotionPresence>{openedBooking === 'new' || selectedBooking ? <BookingSheet key={openedBooking} booking={selectedBooking} onClose={() => setOpenedBooking(null)} /> : null}</MotionPresence>
    </SafeAreaView>
  );
}

const STUB_WIDTH = 60;
const NOTCH_RADIUS = 10;

const createStyles = (palette: Palette) => StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: palette.canvas },
  content: { width: '100%', maxWidth: 800, alignSelf: 'center', paddingHorizontal: 20, paddingBottom: 112 },
  empty: { minHeight: 260, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.paper, borderRadius: 32, padding: 28, marginTop: 24 },
  emptyMark: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.sky, marginBottom: 18 },
  emptyMarkText: { color: palette.ocean, fontSize: 27, fontWeight: '700' },
  emptyTitle: { color: palette.ink, fontSize: 19, fontWeight: '900', textAlign: 'center' },
  emptyBody: { color: palette.slate, fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: 8 },
  ticketList: { gap: 16, marginTop: 24 },
  ticket: { minHeight: 174, flexDirection: 'row', position: 'relative', overflow: 'hidden', borderRadius: 28, backgroundColor: palette.paper },
  copy: { flex: 1, minWidth: 0, padding: 20 },
  ticketTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  ticketTopMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  documentCount: { color: palette.ocean, fontSize: 9, fontWeight: '800' },
  typeTag: { alignSelf: 'flex-start', backgroundColor: palette.sky, borderRadius: 64, paddingHorizontal: 10, paddingVertical: 5 },
  type: { color: palette.ink, fontFamily: mono, fontSize: 9, letterSpacing: 0.8 },
  serial: { color: palette.smoke, fontFamily: mono, fontSize: 9 },
  cardTitle: { color: palette.ink, fontSize: 18, lineHeight: 25, fontWeight: '900', letterSpacing: -0.4, marginTop: 18 },
  detail: { color: palette.slate, fontSize: 14, marginTop: 6 },
  meta: { color: palette.slate, fontFamily: mono, fontSize: 10, lineHeight: 16, marginTop: 12 },
  stub: { width: STUB_WIDTH, flexShrink: 0, borderLeftWidth: 1, borderStyle: 'dashed', borderLeftColor: palette.ocean, backgroundColor: palette.sky, alignItems: 'center', justifyContent: 'center' },
  icon: { color: palette.ocean, fontSize: 24, fontWeight: '900' },
  stubNo: { color: palette.ink, fontSize: 24, lineHeight: 27, fontWeight: '900', marginTop: 12 },
  stubLabel: { color: palette.smoke, fontFamily: mono, fontSize: 8, marginTop: 2 },
  notch: { position: 'absolute', right: STUB_WIDTH - NOTCH_RADIUS - 0.5, width: NOTCH_RADIUS * 2, height: NOTCH_RADIUS * 2, borderRadius: NOTCH_RADIUS, backgroundColor: palette.canvas, zIndex: 2 },
  notchTop: { top: -NOTCH_RADIUS },
  notchBottom: { bottom: -NOTCH_RADIUS },
  pressed: { opacity: 0.62 },
});
