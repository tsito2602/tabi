import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { MotionTabs } from '@/components/motion-tabs';
import { MotionPresence } from '@/components/motion-presence';
import { bookingDurationLabel } from '@/data/booking-duration';
import { usePalette, useThemedStyles } from '@/theme/theme-provider';
import { useDesktop } from '@/hooks/use-desktop';
import { PageHeading } from '@/components/page-heading';
import { useToast } from '@/components/toast';
import { TripHero, useTripHero } from '@/components/trip-hero';
import { useTripHeaderHeight } from '@/components/trip-header-context';
import { BookingSheet } from '@/components/booking-sheet';
import { ItineraryCategoryPicker, ItineraryFields } from '@/components/itinerary-fields';
import { durationLabel, durationMinutes, emptyItineraryDetails, orderItineraryEntries, itemCategory, itemDetails, itemEndLabel, itineraryDetailsError, transportLabel, transportModes } from '@/data/itinerary';
import { PlaceSheet } from '@/components/place-sheet';
import { SymbolView } from 'expo-symbols';
import { useLocalSearchParams } from 'expo-router';
import { Fragment, type ComponentProps, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NativeScrollEvent, NativeSyntheticEvent, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FormSheet } from '@/components/form-sheet';
import { validDate } from '@/utils/dates';
import { DateRangePicker } from '@/components/date-range-picker';
import { FloatingAddButton } from '@/components/floating-add-button';
import { FlightConnectionLink, FlightConnectionSheet } from '@/components/flight-connection-sheet';
import { mono, type Palette } from '@/constants/design';
import { findAirportByCode } from '@/data/airports';
import { findFlightConnections, hasLikelyFlightConnection, formatConnectionDuration, type FlightConnection } from '@/data/flight-connections';
import type { Booking, BookingKind, ItineraryItem, ItineraryDetails } from '@/data/types';
import { useTravel } from '@/data/travel-provider';
import { confirmDeletion } from '@/utils/confirm-deletion';

const BOOKING_STAGES: Record<BookingKind, [string, string]> = {
  flight: ['出発', '到着'],
  hotel: ['チェックイン', 'チェックアウト'],
  train: ['乗車', '到着'],
  car: ['受取', '返却'],
  restaurant: ['予約', '終了'],
  ticket: ['利用', '終了'],
  other: ['予約', '終了'],
};

type SymbolName = ComponentProps<typeof SymbolView>['name'];

const BOOKING_ICONS: Record<BookingKind, SymbolName> = {
  flight: { ios: 'airplane', android: 'flight', web: 'flight' },
  hotel: { ios: 'bed.double.fill', android: 'hotel', web: 'hotel' },
  train: { ios: 'train.side.front.car', android: 'train', web: 'train' },
  car: { ios: 'car.fill', android: 'directions_car', web: 'directions_car' },
  restaurant: { ios: 'fork.knife', android: 'restaurant', web: 'restaurant' },
  ticket: { ios: 'ticket.fill', android: 'confirmation_number', web: 'confirmation_number' },
  other: { ios: 'bookmark.fill', android: 'bookmark', web: 'bookmark' },
};

const EMPTY_ICON: SymbolName = { ios: 'calendar', android: 'calendar_today', web: 'calendar_today' };
const CONNECTION_ICON: SymbolName = { ios: 'clock', android: 'schedule', web: 'schedule' };

type TimelineEntry = {
  key: string;
  day: string;
  time: string;
  title: string;
  note: string;
  item?: ItineraryItem;
  booking?: Booking;
  bookingStage?: string;
  bookingEndpoint?: 'start' | 'end';
};

function bookingNote(booking: Booking) {
  if (booking.origin || booking.destination) {
    return `${booking.originCode || booking.origin} → ${booking.destinationCode || booking.destination}`;
  }
  return booking.detail;
}

function bookingTimelineEntries(booking: Booking): TimelineEntry[] {
  const [startStage, endStage] = BOOKING_STAGES[booking.kind];
  const entries: TimelineEntry[] = [{
    key: `booking-${booking.id}-start`,
    day: booking.day,
    time: booking.time,
    title: booking.title,
    note: bookingNote(booking),
    booking,
    bookingStage: startStage,
    bookingEndpoint: 'start',
  }];

  if (booking.endTime && (booking.endDay !== booking.day || booking.endTime !== booking.time)) {
    entries.push({
      key: `booking-${booking.id}-end`,
      day: booking.endDay || booking.day,
      time: booking.endTime,
      title: booking.title,
      note: bookingNote(booking),
      booking,
      bookingStage: endStage,
      bookingEndpoint: 'end',
    });
  }
  return entries;
}

function datesBetween(start: string, end: string) {
  const dates: string[] = [];
  const cursor = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  if (Number.isNaN(cursor.getTime()) || Number.isNaN(last.getTime()) || cursor > last) return dates;
  while (cursor <= last && dates.length < 370) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function shortDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric' }).format(date);
}

function longDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' }).format(date);
}

function entryTitle(entry: TimelineEntry) {
  const booking = entry.booking;
  if (booking?.kind === 'flight') {
    const code = entry.bookingEndpoint === 'end' ? booking.destinationCode : booking.originCode;
    const airport = findAirportByCode(code);
    const name = airport?.city || (entry.bookingEndpoint === 'end' ? booking.destination : booking.origin);
    return [name, code].filter(Boolean).join('  ');
  }
  if (!booking || (!booking.origin && !booking.destination)) return entry.title;
  const origin = booking.originCode || booking.origin;
  const destination = booking.destinationCode || booking.destination;
  return [origin, destination].filter(Boolean).join(' → ');
}

function bookingDetails(entry: TimelineEntry) {
  if (!entry.booking) return [];
  const booking = entry.booking;
  const [startStage, endStage] = BOOKING_STAGES[booking.kind];
  if (booking.kind === 'flight') {
    const endDate = booking.endDay !== booking.day ? `${shortDate(booking.endDay)} ` : '';
    const origin = findAirportByCode(booking.originCode)?.city || booking.originCode || booking.origin;
    const destination = findAirportByCode(booking.destinationCode)?.city || booking.destinationCode || booking.destination;
    return entry.bookingEndpoint === 'end'
      ? [`到着 · ${booking.title}`, `${origin}から`]
      : [`出発 · ${booking.title}`, `${destination}へ${booking.endTime ? ` · ${endDate}${booking.endTime} 着` : ''}`];
  }
  if (entry.bookingEndpoint === 'end') {
    return [`${endStage} · ${booking.title}`, `${startStage} ${shortDate(booking.day)} ${booking.time}`].filter(Boolean);
  }
  const endDate = booking.endDay && booking.endDay !== booking.day ? `${shortDate(booking.endDay)} ` : '';
  return [`${startStage} · ${booking.title}`, booking.endTime ? `${endStage} ${endDate}${booking.endTime}` : ''].filter(Boolean);
}

function timeZoneLabel(entry: TimelineEntry) {
  if (entry.booking?.kind !== 'flight') return '現地時刻';
  const code = entry.bookingEndpoint === 'end' ? entry.booking.destinationCode : entry.booking.originCode;
  const airport = findAirportByCode(code);
  if (!airport) return '現地時刻';
  if (airport.timeZone === 'Asia/Tokyo') return 'JST';
  const date = new Date(`${entry.day}T12:00:00Z`);
  return new Intl.DateTimeFormat('en-US', { timeZone: airport.timeZone, timeZoneName: 'shortOffset' })
    .formatToParts(date)
    .find((part) => part.type === 'timeZoneName')?.value ?? '現地時刻';
}

export default function ItineraryScreen() {
  const reduced = useReducedMotion();
  const palette = usePalette();
  const styles = useThemedStyles(createStyles);

  const desktop = useDesktop();
  const toast = useToast();
  const headerHeight = useTripHeaderHeight();
  const hero = useTripHero();
  const [dayBarHeight, setDayBarHeight] = useState(60);
  const { height: windowHeight } = useWindowDimensions();
  const { canEdit, selectedTrip, items, places, bookings, createItem, updateItem, deleteItem, pendingCount } = useTravel();
  const { itemId } = useLocalSearchParams<{ itemId?: string }>();
  const requestedDay = items.find((item) => item.id === itemId)?.day;
  const pendingScrollDay = useRef<string | null>(null);
  const [viewingBookingId, setViewingBookingId] = useState<string | null>(null);
  const viewingBooking = bookings.find((booking) => booking.id === viewingBookingId);
  const [viewingItemId, setViewingItemId] = useState<string | null>(null);
  const viewingItem = items.find((item) => item.id === viewingItemId);
  const viewingPlace = viewingItem ? places.find((place) => place.itineraryItemId === viewingItem.id) : undefined;
  const [adding, setAdding] = useState(false);
  const isViewingItem = Boolean(viewingItem) && !adding;
  const [formError, setFormError] = useState('');
  const [initialDraft, setInitialDraft] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const editingPlace = editingId ? places.find((place) => place.itineraryItemId === editingId) : undefined;
  const [connectionBookingId, setConnectionBookingId] = useState<string | null>(null);
  const [day, setDay] = useState(selectedTrip?.startsOn ?? '');
  const [time, setTime] = useState('10:00');
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [planDetails, setPlanDetails] = useState<ItineraryDetails>(emptyItineraryDetails());
  const moving = planDetails.category === 'transport';
  const scrollRef = useRef<ScrollView>(null);
  const dateScrollRef = useRef<ScrollView>(null);
  const dateTabOffsets = useRef<Record<string, { x: number; width: number }>>({});
  const dateViewport = useRef(0);
  const sheetOffset = useRef(0);
  const timelineOffset = useRef(0);
  const dayOffsets = useRef<Record<string, number>>({});
  const programmaticScrollDay = useRef<string | null>(null);
  const scrollTrackingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flightConnections = useMemo(() => findFlightConnections(bookings), [bookings]);
  const connectionByArrival = useMemo(() => new Map(flightConnections.map((connection) => [connection.arrivalBookingId, connection])), [flightConnections]);

  const timeline = orderItineraryEntries([
    ...items.map<TimelineEntry>((item) => ({ key: `item-${item.id}`, day: item.day, time: item.time, title: places.find((place) => place.itineraryItemId === item.id)?.title ?? item.title, note: item.note, item })),
    ...bookings.flatMap(bookingTimelineEntries),
  ]);
  // Continue a layover rail only when the next visible event is that flight.
  // A manually selected later departure must not appear attached to an
  // unrelated flight or plan that falls between the two endpoints.
  const connectedDepartures = new Set(flightConnections.filter((connection) => {
    const index = timeline.findIndex((entry) => entry.booking?.id === connection.departureBookingId && entry.bookingEndpoint === 'start');
    const previous = timeline[index - 1];
    return previous?.booking?.id === connection.arrivalBookingId && previous.bookingEndpoint === 'end';
  }).map((connection) => connection.departureBookingId));
  const grouped = timeline.reduce<Record<string, TimelineEntry[]>>((result, entry) => {
    (result[entry.day] ??= []).push(entry);
    return result;
  }, {});
  const itineraryDates = [...new Set([
    ...(selectedTrip ? datesBetween(selectedTrip.startsOn, selectedTrip.endsOn) : []),
    ...Object.keys(grouped),
  ])].sort();
  const [activeDay, setActiveDay] = useState(selectedTrip?.startsOn ?? '');
  const visibleActiveDay = itineraryDates.includes(activeDay) ? activeDay : itineraryDates[0];

  useEffect(() => {
    const frame = dateTabOffsets.current[visibleActiveDay];
    if (frame) dateScrollRef.current?.scrollTo({ x: Math.max(0, frame.x - (dateViewport.current - frame.width) / 2), animated: !reduced });
  }, [visibleActiveDay, reduced]);

  const resumeScrollTracking = useCallback(() => {
    programmaticScrollDay.current = null;
    if (scrollTrackingTimer.current) clearTimeout(scrollTrackingTimer.current);
    scrollTrackingTimer.current = null;
  }, []);

  useEffect(() => () => {
    if (scrollTrackingTimer.current) clearTimeout(scrollTrackingTimer.current);
  }, []);

  const scrollToDay = useCallback((date: string) => {
    const offset = dayOffsets.current[date];
    resumeScrollTracking();
    programmaticScrollDay.current = date;
    setActiveDay(date);
    if (offset === undefined) {
      resumeScrollTracking();
      return;
    }
    scrollRef.current?.scrollTo({ y: Math.max(0, sheetOffset.current + timelineOffset.current + offset - dayBarHeight - 10), animated: !reduced });
    scrollTrackingTimer.current = setTimeout(resumeScrollTracking, 1000);
  }, [dayBarHeight, resumeScrollTracking, reduced]);

  const scrollToRequestedDay = useCallback(() => {
    const date = pendingScrollDay.current;
    if (!date || dayOffsets.current[date] === undefined) return;
    pendingScrollDay.current = null;
    scrollToDay(date);
  }, [scrollToDay]);

  useEffect(() => {
    pendingScrollDay.current = requestedDay ?? null;
    const frame = requestAnimationFrame(scrollToRequestedDay);
    return () => cancelAnimationFrame(frame);
  }, [itemId, requestedDay, scrollToRequestedDay]);

  const trackVisibleDay = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    hero?.scrollY.setValue(Math.max(0, event.nativeEvent.contentOffset.y));
    if (programmaticScrollDay.current) return;
    const scrollPosition = event.nativeEvent.contentOffset.y + dayBarHeight + 24 - sheetOffset.current - timelineOffset.current;
    let visibleDay = itineraryDates[0];
    for (const date of itineraryDates) {
      if ((dayOffsets.current[date] ?? Number.POSITIVE_INFINITY) <= scrollPosition) visibleDay = date;
      else break;
    }
    if (visibleDay && visibleDay !== visibleActiveDay) setActiveDay(visibleDay);
  };

  const openAdd = () => {
    if (!selectedTrip) return;
    setViewingItemId(null);
    setEditingId(null);
    const startDay = visibleActiveDay || selectedTrip.startsOn;
    const startTime = '10:00';
    const details = emptyItineraryDetails();
    setDay(startDay);
    setTime(startTime);
    setPlanDetails(details);
    setTitle('');
    setNote('');
    setInitialDraft(JSON.stringify([startDay, startTime, '', '', details]));
    setFormError('');
    setAdding(true);
  };

  const openEdit = (item: ItineraryItem) => {
    setEditingId(item.id);
    setDay(item.day);
    const editTime = item.time;
    setTime(editTime);
    setTitle(item.title);
    setNote(item.note);
    setPlanDetails(itemDetails(item));
    setInitialDraft(JSON.stringify([item.day, editTime, item.title, item.note, itemDetails(item)]));
    setFormError('');
    setAdding(true);
  };

  const closeEditor = () => {
    setAdding(false);
    setEditingId(null);
  };

  const save = () => {
    const savedTitle = title.trim() || (moving ? [planDetails.transport?.origin, planDetails.transport?.destination].filter(Boolean).join(' → ') || `${transportLabel(planDetails)}で移動` : '');
    if (!savedTitle || !validDate(day) || !/^([01]\d|2[0-3]):[0-5]\d$|^$/.test(time)) {
      setFormError('日付、予定名、正しい時刻を入力してください');
      return;
    }
    const details: ItineraryDetails = { ...planDetails, ...(moving ? { location: '', transport: planDetails.transport ?? { mode: 'walk', origin: '', destination: '' } } : { transport: undefined }) };
    const error = itineraryDetailsError(day, time, details) || (details.endDay && !details.endTime ? '終了・到着時刻を入力するか、日時を外してください' : '');
    if (error) { setFormError(error); return; }
    const originalItem = items.find((item) => item.id === editingId);
    const input = editingPlace && originalItem ? { ...originalItem, day, time, details } : { day, time, kind: '予定', title: savedTitle.slice(0, 160), note: note.trim(), details };
    if (editingId) updateItem(editingId, input);
    else createItem(input);
    closeEditor(); toast('予定を保存しました');
  };

  const remove = () => {
    if (!editingId) return;
    confirmDeletion('予定を削除しますか？', title, () => {
      deleteItem(editingId);
      setViewingItemId(null);
      closeEditor();
    });
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={[]}>
      {desktop ? <>
        <View style={{ position: 'absolute', top: headerHeight + 20, left: 32, right: 32 }}><PageHeading title="しおり" count={`${itineraryDates.length}日間`} /></View>
        <ScrollView testID="desktop-day-index" style={{ position: 'absolute', top: headerHeight + 100, bottom: 24, left: 32, width: 150 }} contentContainerStyle={{ gap: 6 }}>
          {itineraryDates.map((date, index) => <Pressable key={date} accessibilityRole="button" accessibilityLabel={`${index + 1}日目 ${shortDate(date)}へ移動`} accessibilityState={{ selected: date === visibleActiveDay }} onPress={() => scrollToDay(date)} style={{ padding: 14, borderRadius: 12, gap: 5, backgroundColor: date === visibleActiveDay ? palette.sky : 'transparent' }}><Text style={{ color: palette.ocean, fontSize: 11, fontWeight: '700' }}>{index + 1}日目</Text><Text style={{ color: palette.ink, fontSize: 18, fontWeight: '700' }}>{shortDate(date)}</Text><Text style={{ color: palette.smoke, fontSize: 11 }}>{grouped[date]?.length ?? 0}件の予定</Text></Pressable>)}
        </ScrollView>
      </> : null}
      <ScrollView
        testID="itinerary-scroll" style={{ marginTop: headerHeight + (desktop ? 98 : 0), marginLeft: desktop ? 200 : 0 }}
        stickyHeaderIndices={[1]}
        contentContainerStyle={styles.scrollContent}
        onContentSizeChange={scrollToRequestedDay}
        onMomentumScrollEnd={resumeScrollTracking}
        onScroll={trackVisibleDay}
        onScrollBeginDrag={resumeScrollTracking}
        ref={scrollRef}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        >
        <View testID="itinerary-intro" onLayout={(event) => hero?.setPinAt(event.nativeEvent.layout.height)}>
          {desktop && selectedTrip && hero ? <View testID="desktop-trip-cover" style={{ height: 260, overflow: 'hidden' }}><TripHero trip={selectedTrip} height={260} scrollY={hero.scrollY} /></View> : <View pointerEvents="none" style={{ height: Math.max(0, (hero?.height ?? headerHeight + 200) - headerHeight - 28) }} />}
          {!desktop ? <View style={styles.journalSheet}><View style={styles.content}><View style={styles.sheetIntro}><Text style={styles.journalLabel}>しおり</Text><Text style={styles.journalCount}>{itineraryDates.length}日間</Text></View></View></View> : null}
        </View>
        <View testID="itinerary-day-bar" onLayout={(event) => setDayBarHeight(event.nativeEvent.layout.height)} style={styles.dayNavSticky}>
          {selectedTrip && itineraryDates.length ? <ScrollView testID="itinerary-day-tabs" ref={dateScrollRef} onLayout={(event) => { dateViewport.current = event.nativeEvent.layout.width; }} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1 }}><MotionTabs style={styles.dayTabs}>
            {itineraryDates.map((date, index) => {
              const selected = date === visibleActiveDay;
              return <Pressable accessibilityRole="tab" aria-selected={selected} onLayout={(event) => { dateTabOffsets.current[date] = event.nativeEvent.layout; }} key={date} onPress={() => scrollToDay(date)} style={[styles.dayTab, selected && styles.dayTabSelected]}>
                <Text style={[styles.dayTabLabel, selected && styles.dayTabLabelSelected]}>{index + 1}日目</Text>
                <Text style={[styles.dayTabDate, selected && styles.dayTabDateSelected]}>{shortDate(date)}</Text>
              </Pressable>;
            })}
          </MotionTabs></ScrollView> : null}
        </View>
        <View onLayout={(event) => { sheetOffset.current = event.nativeEvent.layout.y; }} style={[styles.journalBody, { minHeight: windowHeight - headerHeight }]}>
        <View style={[styles.content, { paddingBottom: Math.max(128, windowHeight - headerHeight - dayBarHeight - 100) }]}>
        {pendingCount ? <Text style={styles.pending}>{pendingCount}件を端末に保存済み · オンライン時に同期</Text> : null}

        {!selectedTrip ? (
          <View style={styles.empty}><Text style={styles.emptyTitle}>旅行がありません</Text><Text style={styles.emptyBody}>旅行一覧から旅行を選択してください。</Text></View>
        ) : <View onLayout={(event) => { timelineOffset.current = event.nativeEvent.layout.y; }} style={styles.timeline}>{itineraryDates.map((date, dayIndex) => {
          const dateItems = grouped[date] ?? [];
          return (
            <View key={date} onLayout={(event) => { dayOffsets.current[date] = event.nativeEvent.layout.y; }} style={styles.daySection}>
              <View style={[styles.dateBar, dayIndex > 0 && styles.dateBarDivider]}>
                <Text numberOfLines={1} style={styles.date}>{longDate(date)}</Text>
                <Text style={styles.dateDay}>DAY {String(dayIndex + 1).padStart(2, '0')}</Text>
              </View>
              {dateItems.length ? <View>
                  {dateItems.map((entry, entryIndex) => {
                    const details = entry.item ? [itemCategory(entry.item).label, ...(itemDetails(entry.item).location ? [itemDetails(entry.item).location] : [])] : [...bookingDetails(entry), entry.booking?.kind === 'flight' ? '' : bookingDurationLabel(entry.booking!)].filter(Boolean);
                    const isTransport = entry.item && itemDetails(entry.item).category === 'transport';
                    const previous = dateItems[entryIndex - 1], next = dateItems[entryIndex + 1];
                    const previousTransport = previous?.item && itemDetails(previous.item).category === 'transport';
                    const nextTransport = next?.item && itemDetails(next.item).category === 'transport';
                    const category = entry.item ? itemCategory(entry.item) : undefined;
                    const isLinkedStart = entry.bookingEndpoint === 'start' && Boolean(entry.booking?.endTime);
                    const isLinkedEnd = entry.bookingEndpoint === 'end';
                    const connection = isLinkedEnd && entry.booking ? connectionByArrival.get(entry.booking.id) : undefined;
                    const isConnectedDeparture = entry.bookingEndpoint === 'start' && Boolean(entry.booking && connectedDepartures.has(entry.booking.id));
                    return (
                    <Fragment key={entry.key}>
                    {isTransport ? <TransportRow item={entry.item!} hasPrevious={Boolean(previous)} hasNext={Boolean(next)} onPress={() => setViewingItemId(entry.item!.id)} /> : <Pressable
                      accessibilityHint={entry.booking ? '予約の詳細を開きます' : '予定の詳細を開きます'}
                      accessibilityRole="button"
                      onPress={() => entry.booking ? setViewingBookingId(entry.booking.id) : setViewingItemId(entry.item!.id)}
                      style={({ pressed }) => [styles.itemRow, (isLinkedStart || isLinkedEnd) && styles.linkedBookingRow, pressed && styles.itemPressed]}>
                      <View style={styles.timeColumn}>
                        <Text style={styles.time}>{entry.time || '—'}</Text>
                        <Text style={styles.timeZone}>{entry.item ? itemEndLabel(entry.item) ? `〜 ${itemEndLabel(entry.item)}` : '' : timeZoneLabel(entry)}</Text>
                      </View>
                      <View style={styles.railColumn}>
                        {previousTransport ? <View style={[styles.connectionRail, styles.railTop]} /> : null}
                        {nextTransport ? <View style={[styles.connectionRail, styles.railBottom]} /> : null}
                        {isLinkedEnd ? <View style={[styles.rail, styles.railTop, styles.linkedRail]} /> : isConnectedDeparture ? <View style={[styles.connectionRail, styles.railTop]} /> : null}
                        {isLinkedStart ? <View style={[styles.rail, styles.railBottom, styles.linkedRail]} /> : null}
                        {connection ? <View style={[styles.connectionRail, styles.railBottom]} /> : null}
                        <View style={[styles.iconCircle, entry.booking && styles.bookingIconCircle, isLinkedEnd && styles.bookingEndIconCircle]}>
                          <SymbolView
                            name={entry.booking?.kind === 'flight'
                              ? isLinkedEnd ? { ios: 'airplane.arrival', android: 'flight_land', web: 'flight_land' } : { ios: 'airplane.departure', android: 'flight_takeoff', web: 'flight_takeoff' }
                              : entry.booking ? BOOKING_ICONS[entry.booking.kind] : { ios: category!.ios, android: category!.icon, web: category!.icon } as SymbolName}
                            size={21}
                            weight="semibold"
                            tintColor={entry.booking && !isLinkedEnd ? palette.paper : palette.ocean}
                          />
                        </View>
                      </View>
                      <View style={[styles.itemCopy, entryIndex < dateItems.length - 1 && !nextTransport && styles.itemDivider]}>
                        <Text style={styles.itemTitle}>{entryTitle(entry)}</Text>
                        {details.map((detail, index) => <Text key={`${entry.key}-detail-${index}`} style={[styles.note, index === 0 && styles.bookingTag]}>{detail}</Text>)}
                      </View>
                      <Text style={styles.chevron}>›</Text>
                    </Pressable>}
                    {connection ? <ConnectionRow disabled={!canEdit} connection={connection} continueRail={connectedDepartures.has(connection.departureBookingId)} nextFlight={bookings.find((flight) => flight.id === connection.departureBookingId)} onPress={() => setConnectionBookingId(connection.arrivalBookingId)} />
                      : canEdit && isLinkedEnd && entry.booking?.kind === 'flight' && hasLikelyFlightConnection(entry.booking, bookings)
                        ? <View style={styles.connectionAction}><FlightConnectionLink compact booking={entry.booking} onPress={() => setConnectionBookingId(entry.booking!.id)} /></View> : null}
                    </Fragment>
                    );
                  })}
                </View> : <View style={styles.emptyRow}>
                  <View style={styles.timeColumn}><Text style={styles.emptyTime}>—</Text></View>
                  <View style={styles.railColumn}><View style={styles.emptyIconCircle}><SymbolView name={EMPTY_ICON} size={18} tintColor={palette.smoke} /></View></View>
                  <Text style={styles.emptyDay}>予定はまだありません</Text>
                </View>}
            </View>
          );
        })}</View>}
        </View>
        </View>
      </ScrollView>

      {selectedTrip && canEdit ? <FloatingAddButton label="予定を追加する" onPress={() => openAdd()} /> : null}
      <MotionPresence>{connectionBookingId ? <FlightConnectionSheet bookingId={connectionBookingId} onClose={() => setConnectionBookingId(null)} /> : null}</MotionPresence>

      <MotionPresence>{viewingBooking ? <BookingSheet key={`${selectedTrip?.id}:${viewingBooking.id}`} booking={viewingBooking} onClose={() => setViewingBookingId(null)} /> : null}</MotionPresence>

      <MotionPresence>{isViewingItem && viewingPlace ? <PlaceSheet key={viewingPlace.id} place={viewingPlace} onClose={() => setViewingItemId(null)} onEditSchedule={() => openEdit(viewingItem!)} /> : null}</MotionPresence>

      <FormSheet visible={adding || (Boolean(viewingItem) && !viewingPlace)} presentation={isViewingItem ? 'detail' : 'form'} title={isViewingItem ? '予定の詳細' : editingPlace ? '予定を編集' : editingId ? '予定を編集' : '予定を追加'} onClose={() => { if (isViewingItem) setViewingItemId(null); else closeEditor(); }} onSave={canEdit ? isViewingItem ? () => openEdit(viewingItem!) : save : undefined} saveLabel={isViewingItem ? '編集' : '保存'} canSave={isViewingItem || moving || Boolean(title.trim())} dirty={!isViewingItem && JSON.stringify([day, time, title, note, planDetails]) !== initialDraft} error={isViewingItem ? undefined : formError}>
        {isViewingItem && viewingItem ? <View testID="itinerary-item-details" style={styles.planDetails}>
          <Text style={styles.bookingTag}>{itemCategory(viewingItem).label}</Text>
          <Text selectable style={styles.planTitle}>{viewingItem.title}</Text>
          <View style={styles.planDate}>
            <SymbolView name={{ ios: 'calendar', android: 'calendar_today', web: 'calendar_today' }} size={20} tintColor={palette.ocean} />
            <Text style={styles.planDateText}>{viewingItem.day.replaceAll('-', '/')}　{viewingItem.time || '時刻未定'}{itemEndLabel(viewingItem) ? ` 〜 ${itemEndLabel(viewingItem)}` : ''}</Text>
          </View>
          {itemDetails(viewingItem).category === 'transport' ? <View style={styles.planNote}>
            <Text style={styles.planDateText}>{transportLabel(itemDetails(viewingItem))}　{durationLabel(durationMinutes(viewingItem.day, viewingItem.time, itemDetails(viewingItem)))}</Text>
            <Text selectable style={styles.planNoteText}>出発　{itemDetails(viewingItem).transport?.origin || '未定'}</Text>
            <Text selectable style={styles.planNoteText}>到着　{itemDetails(viewingItem).transport?.destination || '未定'}</Text>
          </View> : itemDetails(viewingItem).location ? <Text selectable style={styles.planNoteText}>{itemDetails(viewingItem).location}</Text> : null}
          {viewingItem.note ? <View style={styles.planNote}>
            <Text style={styles.label}>メモ</Text>
            <Text selectable style={styles.planNoteText}>{viewingItem.note}</Text>
          </View> : null}
        </View> : <>
            <ItineraryCategoryPicker value={planDetails.category} linkedPlace={Boolean(editingPlace)} onChange={(category) => setPlanDetails((current) => ({ ...current, category, ...(category === 'transport' ? { transport: current.transport ?? { mode: 'walk', origin: '', destination: '' } } : {}) }))} />
            <View style={{ marginTop: 18 }}><DateRangePicker mode="single" showTime label={moving ? '出発' : '開始'} startDate={day} endDate={day} startTime={time} onChange={(range) => { setDay(range.startDate); setTime(range.startTime); }} /></View>
            {moving || editingPlace ? <ItineraryFields day={day} time={time} details={planDetails} onChange={setPlanDetails} linkedPlace={Boolean(editingPlace)} /> : null}
            {editingPlace ? <Text style={styles.planDateText}>{editingPlace.title}</Text> : <>
            <Text style={styles.label}>{moving ? '移動名（任意）' : '予定'}</Text><TextInput accessibilityLabel="予定名" maxLength={160} value={title} onChangeText={setTitle} placeholder={moving ? '例：空港行きのバス' : planDetails.category === 'meal' ? 'ランチ・夕食など' : planDetails.category === 'shopping' ? 'おみやげを買う' : '美術館を訪れる'} placeholderTextColor={palette.placeholder} style={styles.input} />
            {!moving ? <ItineraryFields day={day} time={time} details={planDetails} onChange={setPlanDetails} linkedPlace={Boolean(editingPlace)} /> : null}
            <Text style={styles.label}>メモ</Text><TextInput accessibilityLabel="メモ" maxLength={4000} value={note} onChangeText={setNote} placeholder={moving ? '路線名・乗り場・乗り換えなど' : planDetails.category === 'meal' ? '食べたいもの・注文のメモなど' : '当日のメモなど'} placeholderTextColor={palette.placeholder} style={[styles.input, styles.noteInput]} multiline />
            </>}
            {editingId && canEdit ? <Pressable onPress={remove} style={styles.deleteButton}><Text style={styles.deleteText}>この予定を削除</Text></Pressable> : null}
        </>}
      </FormSheet>
    </SafeAreaView>
  );
}

function TransportRow({ item, hasPrevious, hasNext, onPress }: { item: ItineraryItem; hasPrevious: boolean; hasNext: boolean; onPress: () => void }) {
  const styles = useThemedStyles(createStyles);
  const palette = usePalette();
  const details = itemDetails(item), transport = details.transport;
  const mode = transportModes.find((option) => option.value === transport?.mode) ?? transportModes[7];
  const route = [transport?.origin, transport?.destination].filter(Boolean).join(' → ');
  return <Pressable accessibilityRole="button" accessibilityHint="移動の詳細を開きます" onPress={onPress} style={({ pressed }) => [styles.transportRow, pressed && styles.itemPressed]}>
    <View style={styles.transportTime}><Text style={styles.transportTimeText}>{item.time || '—'}</Text>{itemEndLabel(item) ? <Text style={styles.timeZone}>〜 {itemEndLabel(item)}</Text> : null}</View>
    <View style={styles.connectionRailColumn}>
      <View style={[styles.connectionRailFull, !hasPrevious && { top: '50%' }, !hasNext && { bottom: '50%' }]} />
      <View style={styles.transportIcon}><SymbolView name={{ ios: mode.ios, android: mode.icon, web: mode.icon } as SymbolName} size={18} tintColor={palette.ocean} /></View>
    </View>
    <View style={styles.connectionCopy}>
      <View style={styles.connectionHeading}><Text style={styles.transportMode}>{transportLabel(details)}</Text><Text style={styles.connectionDuration}>{durationLabel(durationMinutes(item.day, item.time, details))}</Text></View>
      {item.title !== route.slice(0, 160) && item.title !== `${transportLabel(details)}で移動` ? <Text style={styles.connectionNext}>{item.title}</Text> : null}
    </View><Text style={styles.chevron}>›</Text>
  </Pressable>;
}

function ConnectionRow({ connection, continueRail, nextFlight, onPress, disabled = false }: { connection: FlightConnection; continueRail: boolean; nextFlight?: Booking; onPress: () => void; disabled?: boolean }) {
  const palette = usePalette();
  const styles = useThemedStyles(createStyles);

  return (
    <Pressable disabled={disabled} accessibilityRole="button" accessibilityLabel={`${connection.airportName}で${formatConnectionDuration(connection.durationMinutes)}の乗り継ぎ、${nextFlight?.title ?? '次便'}への紐づけを変更`} onPress={onPress} style={({ pressed }) => [styles.connectionRow, pressed && styles.itemPressed]}>
      <View style={styles.connectionTimeColumn} />
      <View style={styles.connectionRailColumn}>
        <View style={[styles.connectionRailFull, !continueRail && styles.connectionRailEnding]} />
        <View style={styles.connectionIconCircle}>
          <SymbolView name={CONNECTION_ICON} size={15} tintColor={palette.ocean} />
        </View>
      </View>
      <View style={styles.connectionCopy}>
        <View style={styles.connectionHeading}><Text style={styles.connectionTitle}>乗り継ぎ</Text><Text style={styles.connectionDuration}>{formatConnectionDuration(connection.durationMinutes)}</Text></View>
        {nextFlight ? <Text style={styles.connectionNext}>{nextFlight.title} · {shortDate(nextFlight.day)} {nextFlight.time}発 → {nextFlight.destinationCode || nextFlight.destination}</Text> : null}
      </View>
      <Text style={styles.connectionChevron}>›</Text>
    </Pressable>
  );
}

const createStyles = (palette: Palette) => StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: 'transparent' },
  scrollContent: { flexGrow: 1 },
  journalSheet: { backgroundColor: palette.canvas, borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: 'hidden' },
  journalBody: { backgroundColor: palette.canvas },
  sheetIntro: { paddingTop: 24, paddingBottom: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  journalLabel: { color: palette.ocean, fontSize: 10, fontWeight: '700', letterSpacing: 2 },
  journalCount: { color: palette.smoke, fontFamily: mono, fontSize: 10, letterSpacing: 1 },
  content: { width: '100%', maxWidth: 800, alignSelf: 'center', paddingHorizontal: 20 },
  dayNavSticky: { zIndex: 4, paddingVertical: 6, backgroundColor: palette.canvas, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.ash },
  dayTabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 20 },
  dayTab: { minWidth: 68, minHeight: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: palette.mist, paddingHorizontal: 12 },
  dayTabSelected: { backgroundColor: palette.ocean },
  dayTabLabel: { color: palette.slate, fontSize: 13, lineHeight: 17, fontWeight: '800' },
  dayTabLabelSelected: { color: palette.onOcean },
  dayTabDate: { color: palette.smoke, fontFamily: mono, fontSize: 9, lineHeight: 13, marginTop: 1 },
  dayTabDateSelected: { color: palette.onOcean },
  pending: { color: palette.slate, fontFamily: mono, fontSize: 11, marginTop: 4 },
  empty: { minHeight: 430, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyMark: { color: palette.accent, fontSize: 42, fontWeight: '900' },
  emptyTitle: { color: palette.ink, fontSize: 28, lineHeight: 30, fontWeight: '900', letterSpacing: -0.8, marginTop: 14 },
  emptyBody: { color: palette.slate, textAlign: 'center', marginTop: 7 },
  timeline: { marginHorizontal: -20 },
  transportRow: { minHeight: 80, flexDirection: 'row', alignItems: 'stretch', paddingHorizontal: 16 },
  transportTime: { width: 64, justifyContent: 'center' },
  transportTimeText: { color: palette.slate, fontFamily: mono, fontSize: 12, fontWeight: '600' },
  transportIcon: { width: 30, height: 30, borderRadius: 15, backgroundColor: palette.paper, alignItems: 'center', justifyContent: 'center' },
  transportMode: { color: palette.ocean, fontSize: 12, fontWeight: '700' },
  daySection: { backgroundColor: palette.paper },
  dateBar: { minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: palette.mist, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: palette.ash, paddingHorizontal: 20, position: 'relative', zIndex: 2 },
  dateBarDivider: { borderTopWidth: StyleSheet.hairlineWidth },
  date: { flex: 1, color: palette.ink, fontSize: 12, lineHeight: 18, fontWeight: '700', marginRight: 12 },
  dateDay: { color: palette.ocean, fontFamily: mono, fontSize: 10, lineHeight: 14, fontWeight: '700' },
  itemRow: { minHeight: 104, flexDirection: 'row', alignItems: 'stretch', paddingHorizontal: 16 },
  linkedBookingRow: { backgroundColor: palette.soft },
  itemPressed: { opacity: 0.55 },
  timeColumn: { width: 64, alignItems: 'flex-end', paddingTop: 20, paddingRight: 6 },
  time: { color: palette.ink, fontFamily: mono, fontSize: 15, lineHeight: 20, fontWeight: '800' },
  timeZone: { color: palette.smoke, fontFamily: mono, fontSize: 10, lineHeight: 15, marginTop: 2 },
  railColumn: { width: 50, alignItems: 'center', position: 'relative' },
  rail: { position: 'absolute', left: 24, width: 2, backgroundColor: palette.accent },
  linkedRail: { backgroundColor: palette.ocean },
  connectionRail: { position: 'absolute', left: 24, width: 0, borderLeftWidth: 2, borderColor: palette.smoke, borderStyle: 'dashed' },
  railTop: { top: 0, height: 22 },
  railBottom: { top: 62, bottom: 0 },
  iconCircle: { width: 42, height: 42, borderRadius: 21, marginTop: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.soft, borderWidth: 2, borderColor: palette.accent, zIndex: 1 },
  bookingIconCircle: { backgroundColor: palette.ocean, borderColor: palette.ocean },
  bookingEndIconCircle: { backgroundColor: palette.paper, borderColor: palette.ocean },
  connectionRow: { minHeight: 76, flexDirection: 'row', alignItems: 'stretch', paddingHorizontal: 16, backgroundColor: palette.mist },
  connectionTimeColumn: { width: 64 },
  connectionRailColumn: { width: 50, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  connectionRailFull: { position: 'absolute', top: 0, bottom: 0, left: 24, width: 0, borderLeftWidth: 2, borderColor: palette.smoke, borderStyle: 'dashed' },
  connectionRailEnding: { bottom: '50%' },
  connectionIconCircle: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.mist, zIndex: 1 },
  connectionCopy: { flex: 1, justifyContent: 'center', paddingLeft: 8, paddingVertical: 14, gap: 5 },
  connectionHeading: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  connectionTitle: { color: palette.slate, fontSize: 11, lineHeight: 17, fontWeight: '600' },
  connectionDuration: { color: palette.ocean, fontSize: 15, lineHeight: 21, fontWeight: '800' },
  connectionNext: { color: palette.slate, fontSize: 11, lineHeight: 17 },
  connectionChevron: { color: palette.ocean, alignSelf: 'center', fontSize: 22, marginLeft: 8 },
  connectionAction: { paddingLeft: 130, paddingRight: 16, paddingBottom: 12, backgroundColor: palette.soft },
  itemCopy: { flex: 1, justifyContent: 'center', paddingVertical: 18, paddingLeft: 8 },
  itemDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.ash },
  bookingTag: { color: palette.ocean, fontWeight: '700' },
  itemTitle: { color: palette.ink, fontSize: 17, lineHeight: 22, fontWeight: '800' },
  note: { color: palette.slate, fontSize: 12, lineHeight: 17, marginTop: 3 },
  chevron: { color: palette.smoke, alignSelf: 'center', fontSize: 22, lineHeight: 22, marginLeft: 8 },
  emptyRow: { minHeight: 82, flexDirection: 'row', alignItems: 'stretch', paddingHorizontal: 16 },
  emptyTime: { color: palette.smoke, fontFamily: mono, fontSize: 14 },
  emptyIconCircle: { width: 36, height: 36, borderRadius: 18, marginTop: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.mist },
  emptyDay: { flex: 1, alignSelf: 'center', color: palette.smoke, fontSize: 13, lineHeight: 19, paddingLeft: 8 },
  modal: { flex: 1, backgroundColor: palette.canvas },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.ash },
  cancel: { color: palette.slate },
  modalTitle: { color: palette.ink, fontSize: 18, fontWeight: '700' },
  save: { color: palette.ocean, fontWeight: '700' },
  form: { padding: 20, gap: 9 },
  label: { color: palette.slate, fontFamily: mono, fontSize: 11, fontWeight: '400', marginTop: 10 },
  input: { minHeight: 50, backgroundColor: palette.paper, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 14, color: palette.ink, fontSize: 16 },
  planDetails: { gap: 22 },
  planTitle: { color: palette.ink, fontSize: 28, lineHeight: 36, fontWeight: '800' },
  planDate: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  planDateText: { color: palette.slate, fontSize: 15, lineHeight: 22, flexShrink: 1 },
  planNote: { gap: 4 },
  planNoteText: { color: palette.ink, fontSize: 16, lineHeight: 26 },
  noteInput: { minHeight: 120, textAlignVertical: 'top' },
  deleteButton: { minHeight: 50, alignItems: 'center', justifyContent: 'center', marginTop: 24 },
  deleteText: { color: palette.danger, fontSize: 15, fontWeight: '700' },
});
