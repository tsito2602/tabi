import { MotionModal } from './motion-modal';
import type { DetailOrigin } from '@/utils/detail-origin';
import type { ComponentProps } from 'react';
import { usePalette, useThemedStyles } from '@/theme/theme-provider';
import { useModalViewport } from '@/hooks/use-modal-viewport';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { type Palette } from '@/constants/design';
import { findAirportByCode } from '@/data/airports';
import { findFlightConnections, flightConnectionCandidates, formatConnectionDuration, type FlightConnection } from '@/data/flight-connections';
import { useTravel } from '@/data/travel-provider';
import type { Booking, FlightConnectionMode } from '@/data/types';

export function flightDate(day: string) {
  const parts = day.split('-');
  return parts.length === 3 ? `${Number(parts[1])}/${Number(parts[2])}` : day;
}

export function FlightConnectionLink({ booking, connection, nextFlight, onPress, compact = false, disabled = false }: {
  booking: Booking; connection?: FlightConnection; nextFlight?: Booking; onPress: ComponentProps<typeof Pressable>['onPress']; compact?: boolean; disabled?: boolean;
}) {
  const palette = usePalette();
  const styles = useThemedStyles(createStyles);

  const missing = booking.connectionMode === 'manual' && !connection;
  return <Pressable disabled={disabled} accessibilityRole="button" accessibilityLabel={`${booking.title}の乗り継ぎを${connection ? '変更' : '設定'}`} onPress={onPress}
    style={({ pressed }) => [styles.link, compact && styles.linkCompact, pressed && styles.pressed]}>
    <SymbolView name={{ ios: 'arrow.triangle.branch', android: 'connecting_airports', web: 'connecting_airports' }} size={18} tintColor={palette.ocean} />
    <View style={styles.linkCopy}>
      <Text style={styles.linkTitle}>{connection ? `${connection.airportName}で乗り継ぎ · ${formatConnectionDuration(connection.durationMinutes)}` : missing ? '乗り継ぎ先を選び直す' : booking.connectionMode === 'none' ? '乗り継ぎなし' : '乗り継ぎ便を選ぶ'}</Text>
      {nextFlight ? <Text style={styles.linkDetail}>{nextFlight.title} · {nextFlight.time}発 → {nextFlight.destinationCode || nextFlight.destination}</Text> : null}
    </View>
    <Text style={styles.chevron}>›</Text>
  </Pressable>;
}

export function FlightConnectionSheet({ bookingId, onClose, detailOrigin }: { detailOrigin?: DetailOrigin; bookingId: string; onClose: () => void }) {
  const { canEdit, bookings, selectedTrip, setFlightConnection } = useTravel();
  const booking = bookings.find((item) => item.id === bookingId);
  if (!canEdit || !booking || booking.kind !== 'flight') return null;
  return <ConnectionEditor detailOrigin={detailOrigin} key={`${selectedTrip?.id}:${bookingId}`} booking={booking} bookings={bookings} onClose={onClose} onSave={setFlightConnection} />;
}

function ConnectionEditor({ booking, bookings, onClose, onSave, detailOrigin }: {
  detailOrigin?: DetailOrigin;
  booking: Booking; bookings: Booking[]; onClose: () => void;
  onSave: (id: string, mode: FlightConnectionMode, nextFlightId?: string | null) => void;
}) {
  const styles = useThemedStyles(createStyles);

  const viewport = useModalViewport(true);
  const [mode, setMode] = useState<FlightConnectionMode>(booking.connectionMode ?? 'auto');
  const [target, setTarget] = useState<string | null>(booking.nextFlightId ?? null);
  const [error, setError] = useState('');
  const candidates = flightConnectionCandidates(booking, bookings);
  const autoConnection = findFlightConnections(bookings.map((flight) => flight.id === booking.id ? { ...flight, connectionMode: 'auto', nextFlightId: null } : flight))
    .find((connection) => connection.arrivalBookingId === booking.id);
  const autoFlight = bookings.find((flight) => flight.id === autoConnection?.departureBookingId);
  const chosen = mode === 'auto' ? autoConnection : mode === 'manual' ? candidates.find((item) => item.booking.id === target && !item.assigned)?.connection : undefined;
  const chosenFlight = bookings.find((flight) => flight.id === chosen?.departureBookingId);
  const airport = findAirportByCode(booking.destinationCode);
  const save = () => {
    try { onSave(booking.id, mode, target); onClose(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '便を選び直してください'); }
  };
  const select = (nextMode: FlightConnectionMode, nextTarget: string | null = null) => { setMode(nextMode); setTarget(nextTarget); setError(''); };

  return <MotionModal detailOrigin={detailOrigin} visible transparent animationType="fade" onRequestClose={onClose}>
    <SafeAreaView testID="modal-viewport" style={[styles.backdrop, viewport]}>
      <Pressable accessibilityLabel="乗り継ぎの変更をキャンセル" onPress={onClose} style={StyleSheet.absoluteFill} />
      <View testID="picker-sheet" accessibilityViewIsModal style={styles.sheet}>
        <View testID="sheet-header" style={styles.header}>
          <View><Text style={styles.heading}>乗り継ぎ便</Text><Text style={styles.subtitle}>次に乗る便を選択</Text></View>
          <Pressable accessibilityRole="button" accessibilityLabel="閉じる" onPress={onClose} style={styles.closeButton}><Text style={styles.close}>×</Text></Pressable>
        </View>
        <ScrollView testID="sheet-content-scroll" showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
          <View style={styles.arrival}>
            <Text style={styles.eyebrow}>到着する便</Text>
            <Text style={styles.flightTitle}>{booking.title}</Text>
            <View style={styles.arrivalBottom}>
              <View style={styles.flex}><Text style={styles.airportCode}>{booking.destinationCode || booking.destination}</Text><Text style={styles.city}>{airport?.city || airport?.name || booking.destination}</Text></View>
              <View style={styles.arrivalTime}><Text style={styles.time}>{booking.endTime || '時刻未入力'}</Text><Text style={styles.city}>{flightDate(booking.endDay || booking.day)} 到着・現地時刻</Text></View>
            </View>
          </View>

          <Pressable accessibilityRole="radio" accessibilityState={{ checked: mode === 'auto' }} onPress={() => select('auto')} style={({ pressed }) => [styles.option, mode === 'auto' && styles.selected, pressed && styles.pressed]}>
            <Radio checked={mode === 'auto'} />
            <View style={styles.flex}><Text style={styles.optionTitle}>自動でつなぐ</Text><Text style={styles.optionDetail}>{autoFlight ? `${autoFlight.title} · ${autoFlight.time}発 · ${formatConnectionDuration(autoConnection!.durationMinutes)}` : '該当する便はありません'}</Text></View>
          </Pressable>

          <Text style={styles.sectionLabel}>便を指定</Text>
          {candidates.length ? candidates.map(({ booking: flight, connection, assigned }) => {
            const selected = mode === 'manual' && target === flight.id;
            return <Pressable key={flight.id} accessibilityRole="radio" accessibilityLabel={`${flight.title}、${flightDate(flight.day)} ${flight.time}発、${formatConnectionDuration(connection.durationMinutes)}の乗り継ぎ${assigned ? '、選択できません' : ''}`} accessibilityState={{ checked: selected, disabled: Boolean(assigned) }} disabled={Boolean(assigned)}
              onPress={() => select('manual', flight.id)} style={({ pressed }) => [styles.option, selected && styles.selected, assigned && styles.disabled, pressed && styles.pressed]}>
              <Radio checked={selected} />
              <View style={styles.flex}>
                <View style={styles.candidateTop}><Text style={styles.optionTitle}>{flight.title}</Text><Text style={styles.duration}>{formatConnectionDuration(connection.durationMinutes)}</Text></View>
                <Text style={styles.route}>{flight.originCode || flight.origin} → {flight.destinationCode || flight.destination}</Text>
                <Text style={styles.optionDetail}>{flightDate(flight.day)} {flight.time} 発 → {flightDate(flight.endDay || flight.day)} {flight.endTime} 着</Text>
                {assigned ? <Text style={styles.optionDetail}>{assigned.title}から紐づけ済み</Text> : null}
              </View>
            </Pressable>;
          }) : <View style={styles.empty}><Text style={styles.emptyTitle}>選べる便がありません</Text><Text style={styles.optionDetail}>{booking.destinationCode ? '同じ空港から到着後に出発する航空券を予約に追加してください。' : 'この便の到着空港と日時を入力してください。'}</Text></View>}

          <Pressable accessibilityRole="radio" accessibilityState={{ checked: mode === 'none' }} onPress={() => select('none')} style={({ pressed }) => [styles.option, mode === 'none' && styles.selected, pressed && styles.pressed]}>
            <Radio checked={mode === 'none'} /><Text style={styles.optionTitle}>つながない</Text>
          </Pressable>
          {mode === 'manual' && !chosen ? <Text style={styles.error}>指定した便を選べなくなりました。別の便を選択してください。</Text> : null}
          {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
        </ScrollView>
        <View testID="sheet-footer" style={styles.footer}>
          {chosen && chosenFlight ? <View style={styles.preview}>
            <Text style={styles.previewRoute}>{booking.originCode || booking.origin} → {chosen.airportCode} → {chosenFlight.destinationCode || chosenFlight.destination}</Text>
            <Text style={styles.optionDetail}>乗り継ぎ {formatConnectionDuration(chosen.durationMinutes)}</Text>
          </View> : null}
          <Pressable accessibilityRole="button" disabled={mode === 'manual' && !chosen} accessibilityState={{ disabled: mode === 'manual' && !chosen }} onPress={save} style={({ pressed }) => [styles.save, mode === 'manual' && !chosen && styles.disabled, pressed && styles.pressed]}><Text style={styles.saveText}>保存</Text></Pressable>
        </View>
      </View>
    </SafeAreaView>
  </MotionModal>;
}

function Radio({ checked }: { checked: boolean }) {
  const styles = useThemedStyles(createStyles);

  return <View style={[styles.radio, checked && styles.radioChecked]}>{checked ? <View style={styles.radioDot} /> : null}</View>;
}

const createStyles = (palette: Palette) => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(24,42,54,0.34)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  sheet: { width: '100%', maxWidth: 520, maxHeight: '94%', backgroundColor: palette.canvas, borderRadius: 28, overflow: 'hidden', flexShrink: 1 },
  header: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  heading: { color: palette.ink, fontSize: 23, fontWeight: '800' },
  subtitle: { color: palette.slate, fontSize: 12, marginTop: 5 },
  closeButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  close: { fontSize: 30, color: palette.slate },
  content: { paddingHorizontal: 20, paddingBottom: 20, gap: 10 },
  arrival: { backgroundColor: palette.paper, padding: 18, borderRadius: 18, marginBottom: 6 },
  eyebrow: { color: palette.slate, fontSize: 11, fontWeight: '700' },
  flightTitle: { color: palette.ink, fontSize: 15, fontWeight: '700', marginTop: 8 },
  arrivalBottom: { flexDirection: 'row', alignItems: 'flex-end', gap: 12, marginTop: 16 },
  flex: { flex: 1, minWidth: 0 },
  airportCode: { color: palette.ocean, fontSize: 27, fontWeight: '800' },
  city: { color: palette.slate, fontSize: 11, lineHeight: 17, marginTop: 4 },
  arrivalTime: { alignItems: 'flex-end', flexShrink: 1 },
  time: { color: palette.ink, fontSize: 24, fontWeight: '700', fontVariant: ['tabular-nums'] },
  option: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: palette.paper, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: 'transparent' },
  selected: { backgroundColor: palette.sky, borderColor: palette.ocean },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: palette.smoke, alignItems: 'center', justifyContent: 'center' },
  radioChecked: { borderColor: palette.ocean },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: palette.ocean },
  optionTitle: { color: palette.ink, fontSize: 14, lineHeight: 20, fontWeight: '700', flexShrink: 1 },
  optionDetail: { color: palette.slate, fontSize: 12, lineHeight: 18, marginTop: 4 },
  sectionLabel: { color: palette.slate, fontSize: 12, fontWeight: '700', marginTop: 12, marginBottom: 2 },
  candidateTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  duration: { color: palette.ocean, fontSize: 12, fontWeight: '700' },
  route: { color: palette.ink, fontSize: 16, fontWeight: '700', marginTop: 7 },
  empty: { padding: 18, backgroundColor: palette.paper, borderRadius: 14 },
  emptyTitle: { color: palette.ink, fontSize: 14, fontWeight: '700' },
  footer: { padding: 20, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth, borderColor: palette.ash, gap: 14 },
  preview: { alignItems: 'center' },
  previewRoute: { color: palette.ink, fontSize: 15, fontWeight: '700', textAlign: 'center' },
  save: { minHeight: 48, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.ocean },
  saveText: { color: palette.onOcean, fontSize: 15, fontWeight: '700' },
  error: { color: palette.danger, fontSize: 12, lineHeight: 18 },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.65 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 58, paddingHorizontal: 18, paddingVertical: 12, backgroundColor: palette.mist, borderRadius: 14, marginTop: 6 },
  linkCompact: { marginTop: 0, borderRadius: 12 },
  linkCopy: { flex: 1, minWidth: 0 },
  linkTitle: { color: palette.ocean, fontSize: 12, lineHeight: 18, fontWeight: '700' },
  linkDetail: { color: palette.slate, fontSize: 11, lineHeight: 17, marginTop: 3 },
  chevron: { color: palette.ocean, fontSize: 22 },
});
