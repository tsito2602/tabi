import { useThemedStyles } from '@/theme/theme-provider';
import { Image, StyleSheet, Text, View } from 'react-native';

import { mono, type Palette } from '@/constants/design';
import type { Trip } from '@/data/types';

const STUB_WIDTH = 96;
const NOTCH_RADIUS = 10;

const bars = [1, 2, 1, 3, 1, 2, 2, 1, 3, 1, 1, 2, 3, 1, 2, 1, 3, 2];

function ticketDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ja-JP', { month: 'short', day: 'numeric' }).format(date);
}

export function TripTicket({ trip }: { trip: Trip }) {
  const styles = useThemedStyles(createStyles);

  const photo = Boolean(trip.coverImage);
  const serial = trip.id.replaceAll('-', '').slice(0, 8).toUpperCase();

  return (
    <View nativeID={`trip-ticket-${encodeURIComponent(trip.id)}`} testID="trip-ticket" style={styles.ticket} accessibilityLabel={`${trip.name}、${trip.startsOn}から${trip.endsOn}まで`}>
      <View style={styles.main}>
        <View testID="trip-ticket-art" style={[StyleSheet.absoluteFill, styles.art]}>
        {photo ? <><Image source={{ uri: trip.coverImage }} resizeMode="cover" style={StyleSheet.absoluteFill} /><View testID="ticket-photo-shade" style={[StyleSheet.absoluteFill, styles.photoShade]} /></> : null}
        </View>
        <View style={styles.issuerRow}>
          <View style={[styles.issuerTag, photo && styles.photoTag]}><Text style={[styles.issuer, photo && styles.photoText]}>TABI TRIP TICKET</Text></View>
          <Text style={[styles.serial, photo && styles.photoText]}>NO. {serial}</Text>
        </View>

        <View style={styles.titleBlock}>
          <Text style={[styles.destination, photo && styles.photoText]}>{trip.destination || 'TRAVEL'}</Text>
          <Text testID="trip-ticket-title" style={[styles.title, photo && styles.photoText]} numberOfLines={2}>{trip.name}</Text>
        </View>

        <View style={styles.route}>
          <View>
            <Text style={[styles.fieldLabel, photo && styles.photoText]}>DEPART</Text>
            <Text style={[styles.date, photo && styles.photoText]}>{ticketDate(trip.startsOn)}</Text>
          </View>
          <View style={styles.routeLine}>
            <View style={[styles.routeDot, photo && styles.photoRule]} />
            <View style={[styles.routeRule, photo && styles.photoRule]} />
            <Text style={[styles.routeArrow, photo && styles.photoText]}>→</Text>
          </View>
          <View style={styles.arrival}>
            <Text style={[styles.fieldLabel, photo && styles.photoText]}>RETURN</Text>
            <Text style={[styles.date, photo && styles.photoText]}>{ticketDate(trip.endsOn)}</Text>
          </View>
        </View>
      </View>

      <View testID="ticket-stub" style={styles.stub}>
        <Text style={styles.stubLabel}>TRAVELLERS</Text>
        <Text style={styles.memberCount}>{String(trip.memberCount).padStart(2, '0')}</Text>
        <View style={styles.barcode} accessibilityElementsHidden>
          {bars.map((width, index) => <View key={index} style={[styles.bar, { width }]} />)}
        </View>
        <Text style={styles.stubCode}>{serial.slice(0, 4)}</Text>
      </View>

      <View style={[styles.notch, styles.notchTop]} />
      <View style={[styles.notch, styles.notchBottom]} />
    </View>
  );
}

const createStyles = (palette: Palette) => StyleSheet.create({
  ticket: { minHeight: 206, flexDirection: 'row', overflow: 'hidden', position: 'relative', borderRadius: 24, backgroundColor: palette.paper },
  art: { backgroundColor: palette.paper, borderTopLeftRadius: 24, borderBottomLeftRadius: 24, overflow: 'hidden' },
  photoShade: { backgroundColor: 'rgba(13,32,43,0.52)' },
  photoText: { color: '#FFFFFF' },
  photoTag: { backgroundColor: 'rgba(255,255,255,0.18)' },
  photoRule: { backgroundColor: '#FFFFFFCC' },
  main: { overflow: 'hidden', flex: 1, minWidth: 0, padding: 20, justifyContent: 'space-between' },
  issuerRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 4 },
  issuerTag: { alignSelf: 'flex-start', backgroundColor: palette.sky, borderRadius: 64, paddingHorizontal: 10, paddingVertical: 5 },
  issuer: { color: palette.ink, fontSize: 9, lineHeight: 13, fontWeight: '700', letterSpacing: 1.1 },
  serial: { color: palette.smoke, fontFamily: mono, fontSize: 9, lineHeight: 20, letterSpacing: 0.5 },
  titleBlock: { paddingVertical: 20 },
  destination: { color: palette.ocean, fontSize: 11, lineHeight: 15, fontWeight: '700', letterSpacing: 1.1, textTransform: 'uppercase' },
  title: { color: palette.ink, fontSize: 26, lineHeight: 33, fontWeight: '900', letterSpacing: -1.1, marginTop: 7 },
  route: { flexDirection: 'row', alignItems: 'flex-end' },
  fieldLabel: { color: palette.smoke, fontFamily: mono, fontSize: 9, lineHeight: 13, fontWeight: '400', letterSpacing: 0.8 },
  date: { color: palette.ink, fontSize: 16, lineHeight: 20, fontWeight: '700', marginTop: 2 },
  routeLine: { flex: 1, minWidth: 36, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 9, paddingBottom: 5 },
  routeDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: palette.accent },
  routeRule: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: palette.ocean },
  routeArrow: { color: palette.accent, fontSize: 15, lineHeight: 17, marginLeft: -2 },
  arrival: { alignItems: 'flex-end' },
  stub: { width: STUB_WIDTH, flexShrink: 0, borderLeftWidth: 1, borderStyle: 'dashed', borderLeftColor: palette.ocean, backgroundColor: palette.sky, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  stubLabel: { color: palette.ink, fontFamily: mono, fontSize: 8, lineHeight: 12, fontWeight: '400', letterSpacing: 0.7 },
  memberCount: { color: palette.ink, fontSize: 42, lineHeight: 46, fontWeight: '900', letterSpacing: -1.6, marginTop: 2 },
  barcode: { height: 31, width: 60, marginTop: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'stretch' },
  bar: { height: '100%', backgroundColor: palette.ink },
  stubCode: { color: palette.ink, fontFamily: mono, fontSize: 8, lineHeight: 12, letterSpacing: 2, marginTop: 4 },
  notch: { position: 'absolute', right: STUB_WIDTH - NOTCH_RADIUS - 0.5, width: NOTCH_RADIUS * 2, height: NOTCH_RADIUS * 2, borderRadius: NOTCH_RADIUS, backgroundColor: palette.canvas, zIndex: 2 },
  notchTop: { top: -NOTCH_RADIUS },
  notchBottom: { bottom: -NOTCH_RADIUS },
});
