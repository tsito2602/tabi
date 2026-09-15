import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View, type GestureResponderEvent } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { captureDetailOrigin, type DetailOrigin } from '@/utils/detail-origin';
import { MotionTabs } from '@/components/motion-tabs';
import { MotionPresence } from '@/components/motion-presence';
import { BookingSheet, BOOKING_KINDS } from '@/components/booking-sheet';
import { BookingRoute } from '@/components/booking-route';
import { FloatingAddButton } from '@/components/floating-add-button';
import { FlightConnectionLink, FlightConnectionSheet } from '@/components/flight-connection-sheet';
import { CardContent, SurfaceCard } from '@/components/ui/surface-card';
import { ActionButton } from '@/components/ui/action-button';
import { useTripHeaderHeight } from '@/components/trip-header-context';
import { usePalette, useThemedStyles } from '@/theme/theme-provider';
import { useAuth } from '@/auth/auth-provider';
import { useTravel } from '@/data/travel-provider';
import { bookingDurationLabel } from '@/data/booking-duration';
import { findFlightConnections, hasLikelyFlightConnection } from '@/data/flight-connections';
import { formatDate } from '@/utils/dates';
import type { Palette } from '@/constants/design';

export default function BookingsScreen() {
  const { selectedTrip } = useTravel();
  const { user } = useAuth();
  return <TripBookingsScreen key={`${user?.id}:${selectedTrip?.id}:${selectedTrip?.startsOn}:${selectedTrip?.endsOn}`} />;
}
function TripBookingsScreen() {
  const p = usePalette(), s = useThemedStyles(createStyles), headerHeight = useTripHeaderHeight();
  const { canEdit, bookings, documentsByBooking, selectedTrip } = useTravel();
  const { booking: requestedBooking } = useLocalSearchParams<{ booking?: string | string[] }>();
  const [search, setSearch] = useState(''), [kindFilter, setKindFilter] = useState('all');
  const [openedBooking, setOpenedBooking] = useState<string | null>(null);
  const [origin, setOrigin] = useState<DetailOrigin>();
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const [connectionOrigin, setConnectionOrigin] = useState<DetailOrigin>();
  const connections = useMemo(() => new Map(findFlightConnections(bookings).map(c => [c.arrivalBookingId, c])), [bookings]);
  const filtered = bookings.filter(b => (kindFilter === 'all' || b.kind === kindFilter) && `${b.title} ${b.detail} ${b.origin} ${b.destination} ${b.originCode} ${b.destinationCode} ${b.confirmationCode}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const selectedBooking = bookings.find(b => b.id === openedBooking);
  const create = (event: GestureResponderEvent) => { setOrigin(captureDetailOrigin(event)); setOpenedBooking('new'); };
  useEffect(() => {
    const id = Array.isArray(requestedBooking) ? requestedBooking[0] : requestedBooking;
    if (!id || !bookings.some(b => b.id === id)) return;
    const timer = setTimeout(() => { setOrigin(undefined); setOpenedBooking(id); router.setParams({ booking: undefined }); }, 0);
    return () => clearTimeout(timer);
  }, [requestedBooking, bookings]);
  return <SafeAreaView edges={[]} style={s.screen}>
    <ScrollView testID="bookings-scroll" showsVerticalScrollIndicator={false} contentContainerStyle={[s.content, { paddingTop: headerHeight + 20 }]}>
      {bookings.length ? <View testID="booking-filters" style={s.filters}>
        <TextInput accessibilityLabel="予約を検索" placeholder="予約名・空港・予約番号で検索" value={search} onChangeText={setSearch} placeholderTextColor={p.placeholder} style={s.search} />
        <MotionTabs accessibilityRole="tablist" style={s.kinds}>
          {[{ value: 'all', label: 'すべて' }, ...BOOKING_KINDS.filter(k => bookings.some(b => b.kind === k.value))].map(k => <Pressable key={k.value} accessibilityRole="tab" aria-selected={kindFilter === k.value} onPress={() => setKindFilter(k.value)} style={[s.tab, kindFilter === k.value && s.selected]}><Text style={[s.tabText, kindFilter === k.value && { color: p.ocean }]}>{k.label}</Text></Pressable>)}
        </MotionTabs>
      </View> : null}
      {!selectedTrip ? <View style={s.empty}><Text style={s.emptyTitle}>旅行を選択してください</Text></View>
        : !bookings.length ? <View style={s.empty}><SymbolView name={{ ios: 'ticket', android: 'confirmation_number', web: 'confirmation_number' }} size={32} tintColor={p.smoke} /><Text style={s.emptyTitle}>予約をまとめて持ち歩く</Text><Text style={s.caption}>航空券・ホテル・チケットを保存できます。</Text>{canEdit ? <ActionButton label="予約を追加する" onPress={create} /> : null}</View>
        : !filtered.length ? <View style={s.empty}><Text style={s.emptyTitle}>該当する予約がありません</Text><ActionButton label="絞り込みを解除" variant="secondary" onPress={() => { setSearch(''); setKindFilter('all'); }} /></View>
        : <View testID="booking-grid" style={s.list}>{filtered.map(booking => {
          const kind = BOOKING_KINDS.find(k => k.value === booking.kind);
          const route = Boolean(booking.origin || booking.destination || booking.originCode || booking.destinationCode);
          const location = booking.location ?? booking.detail;
          const detail = booking.kind === 'hotel' ? (/^https?:\/\//i.test(location.trim()) ? '' : location) : booking.detail;
          const count = documentsByBooking[booking.id]?.length ?? 0;
          const connection = connections.get(booking.id);
          const dates = `${formatDate(booking.day)} ${booking.time}${booking.endDay !== booking.day ? ` → ${formatDate(booking.endDay)}` : booking.endTime && booking.endTime !== booking.time ? ` – ${booking.endTime}` : ''}`;
          return <View key={booking.id}><SurfaceCard testID="booking-ticket">
            <CardContent title={booking.title} meta={[kind?.label, dates].filter(Boolean).join(' · ')}
              onPress={event => { setOrigin(captureDetailOrigin(event)); setOpenedBooking(booking.id); }} accessibilityLabel={`${booking.title}の詳細`}>
              {route ? <BookingRoute booking={booking} compact /> : detail ? <Text numberOfLines={2} style={s.caption}>{detail}</Text> : null}
              {route && booking.detail ? <Text numberOfLines={1} style={s.caption}>{booking.detail}</Text> : null}
              {bookingDurationLabel(booking) ? <Text style={s.caption}>{bookingDurationLabel(booking)}</Text> : null}
              {count ? <Text style={s.caption}>書類 {count}件</Text> : null}
            </CardContent>
          </SurfaceCard>
          {booking.kind === 'flight' && (connection || (canEdit && hasLikelyFlightConnection(booking, bookings))) ? <FlightConnectionLink disabled={!canEdit} booking={booking} connection={connection} nextFlight={bookings.find(b => b.id === connection?.departureBookingId)} onPress={event => { setConnectionOrigin(captureDetailOrigin(event)); setConnectionId(booking.id); }} /> : null}
          </View>;
        })}</View>}
    </ScrollView>
    {selectedTrip && canEdit ? <FloatingAddButton label="予約を追加する" onPress={create} /> : null}
    <MotionPresence>{connectionId ? <FlightConnectionSheet detailOrigin={connectionOrigin} bookingId={connectionId} onClose={() => setConnectionId(null)} /> : null}</MotionPresence>
    <MotionPresence>{openedBooking === 'new' || selectedBooking ? <BookingSheet key={openedBooking} detailOrigin={origin} booking={selectedBooking} onClose={() => setOpenedBooking(null)} /> : null}</MotionPresence>
  </SafeAreaView>;
}
const createStyles = (p: Palette) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: p.canvas },
  content: { width: '100%', maxWidth: 800, alignSelf: 'center', paddingHorizontal: 20, paddingBottom: 112, gap: 20 },
  filters: { gap: 12 }, search: { minHeight: 48, padding: 12, backgroundColor: p.paper, borderWidth: 1, borderColor: p.ash, borderRadius: 12, fontSize: 16, color: p.ink },
  kinds: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, tab: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 12, backgroundColor: p.mist },
  selected: { backgroundColor: p.sky }, tabText: { color: p.slate, fontSize: 13, fontWeight: '500' },
  list: { gap: 16 }, empty: { paddingVertical: 56, paddingHorizontal: 24, alignItems: 'center', gap: 16 },
  emptyTitle: { color: p.ink, fontSize: 20, lineHeight: 28, fontWeight: '600' }, caption: { color: p.smoke, fontSize: 13, lineHeight: 21 },
});
