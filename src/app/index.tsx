import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { ScreenShell } from '@/components/screen-shell';
import { Palette } from '@/constants/theme';

const nextStops = [
  { time: '10:30', title: '羽田から空へ', note: '第2ターミナル · 9:45までに保安検査', tone: Palette.coral },
  { time: '12:05', title: '福岡に到着', note: '地下鉄で博多へ · 約11分', tone: Palette.sky },
  { time: '13:30', title: '最初の一杯', note: '博多一双 本店', tone: Palette.sun },
];

function Avatar({ label, color }: { label: string; color: string }) {
  return <View style={[styles.avatar, { backgroundColor: color }]}><Text style={styles.avatarText}>{label}</Text></View>;
}

export default function HomeScreen() {
  const { width } = useWindowDimensions();
  const wide = width >= 760;

  return (
    <ScreenShell
      kicker="次の旅 · あと18日"
      title="福岡、ふたり旅"
      action={<View style={styles.avatars}><Avatar label="つ" color={Palette.ink} /><Avatar label="み" color={Palette.coral} /></View>}>
      <View style={[styles.hero, wide && styles.heroWide]}>
        <View style={styles.heroMain}>
          <View style={styles.heroTopline}>
            <Text style={styles.heroCode}>FUK</Text>
            <View style={styles.routeLine}><View style={styles.routeDot} /><View style={styles.routeDash} /><View style={[styles.routeDot, styles.routeDotEnd]} /></View>
            <Text style={styles.heroCode}>HND</Text>
          </View>
          <View style={styles.heroTitleRow}>
            <View>
              <Text style={styles.heroDate}>SEP 14—16</Text>
              <Text style={styles.heroTitle}>寄り道を、{`\n`}予定にする旅。</Text>
            </View>
            <View style={styles.daySeal}>
              <Text style={styles.daySealValue}>3</Text>
              <Text style={styles.daySealLabel}>DAYS</Text>
            </View>
          </View>
          <View style={styles.weatherRow}>
            <View style={styles.weatherPill}><Text style={styles.weatherPillText}>☀︎ 28°</Text></View>
            <Text style={styles.weatherNote}>薄手の羽織があると安心</Text>
          </View>
        </View>
        <View style={styles.heroStub}>
          <Text style={styles.stubLabel}>BOARDING</Text>
          <Text style={styles.stubValue}>10:30</Text>
          <Text style={styles.stubMeta}>ANA 257</Text>
          <View style={styles.barcode}>{Array.from({ length: 14 }).map((_, i) => <View key={i} style={[styles.bar, { width: i % 3 === 0 ? 3 : 1 }]} />)}</View>
        </View>
      </View>

      <View style={[styles.grid, wide && styles.gridWide]}>
        <View style={[styles.panel, styles.schedulePanel]}>
          <View style={styles.sectionHead}>
            <View>
              <Text style={styles.sectionEyebrow}>DAY 1 · 9月14日</Text>
              <Text style={styles.sectionTitle}>到着まで</Text>
            </View>
            <Pressable accessibilityRole="button" onPress={() => router.push('/itinerary')} hitSlop={12}>
              <Text style={styles.textButton}>日程を開く →</Text>
            </Pressable>
          </View>
          <View style={styles.timeline}>
            {nextStops.map((stop, index) => (
              <View key={stop.time} style={styles.timelineRow}>
                <Text style={styles.time}>{stop.time}</Text>
                <View style={styles.rail}>
                  <View style={[styles.dot, { backgroundColor: stop.tone }]} />
                  {index < nextStops.length - 1 ? <View style={styles.line} /> : null}
                </View>
                <View style={styles.stopCopy}>
                  <Text style={styles.stopTitle}>{stop.title}</Text>
                  <Text style={styles.stopNote}>{stop.note}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.sideColumn}>
          <Pressable onPress={() => router.push('/bookings')} style={({ pressed }) => [styles.miniCard, styles.ticketCard, pressed && styles.pressed]}>
            <View><Text style={styles.miniKicker}>READY TO SHOW</Text><Text style={styles.miniValue}>4</Text><Text style={styles.miniLabel}>予約・チケット</Text></View>
            <Text style={styles.cardArrow}>↗</Text>
          </Pressable>
          <Pressable onPress={() => router.push('/packing')} style={({ pressed }) => [styles.miniCard, styles.packingCard, pressed && styles.pressed]}>
            <View style={styles.miniCardTop}><Text style={styles.miniKickerDark}>PACKING</Text><Text style={styles.cardArrowDark}>↗</Text></View>
            <Text style={styles.packingValue}>12 / 18</Text>
            <View style={styles.progressTrack}><View style={styles.progressFill} /></View>
            <Text style={styles.packingNote}>あと6つで準備完了</Text>
          </Pressable>
        </View>
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  avatars: { flexDirection: 'row' },
  avatar: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: Palette.paper },
  avatarText: { color: Palette.white, fontSize: 13, fontWeight: '900' },
  hero: { borderRadius: 30, overflow: 'hidden', backgroundColor: Palette.ink, minHeight: 310 },
  heroWide: { flexDirection: 'row', minHeight: 280 },
  heroMain: { flex: 1, padding: 24, justifyContent: 'space-between' },
  heroTopline: { flexDirection: 'row', alignItems: 'center' },
  heroCode: { color: Palette.white, fontSize: 12, fontWeight: '900', letterSpacing: 1.5 },
  routeLine: { flex: 1, flexDirection: 'row', alignItems: 'center', marginHorizontal: 12 },
  routeDot: { width: 8, height: 8, borderRadius: 4, borderWidth: 2, borderColor: Palette.coral },
  routeDotEnd: { backgroundColor: Palette.coral },
  routeDash: { flex: 1, height: 1, backgroundColor: '#55706C' },
  heroTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginVertical: 32, gap: 16 },
  heroDate: { color: Palette.sky, fontSize: 12, fontWeight: '900', letterSpacing: 1.6, marginBottom: 8 },
  heroTitle: { color: Palette.white, fontSize: 31, lineHeight: 39, fontWeight: '900', letterSpacing: -1 },
  daySeal: { width: 76, height: 76, borderRadius: 38, borderWidth: 1, borderColor: '#58716E', alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '7deg' }] },
  daySealValue: { color: Palette.sun, fontSize: 28, lineHeight: 30, fontWeight: '900' },
  daySealLabel: { color: '#ADC0BC', fontSize: 9, fontWeight: '900', letterSpacing: 1.3 },
  weatherRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  weatherPill: { backgroundColor: Palette.sun, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  weatherPillText: { color: Palette.ink, fontSize: 13, fontWeight: '900' },
  weatherNote: { color: '#C8D6D3', fontSize: 13 },
  heroStub: { backgroundColor: Palette.coral, padding: 22, minWidth: 180, justifyContent: 'flex-end', borderTopWidth: 1, borderTopColor: '#FF8B70' },
  stubLabel: { color: '#5E1C10', fontSize: 10, fontWeight: '900', letterSpacing: 1.4 },
  stubValue: { color: Palette.white, fontSize: 38, fontWeight: '900', letterSpacing: -1, marginTop: 6 },
  stubMeta: { color: '#641F13', fontSize: 13, fontWeight: '800', marginTop: 2 },
  barcode: { height: 40, flexDirection: 'row', gap: 3, alignItems: 'stretch', marginTop: 20 },
  bar: { backgroundColor: '#702416' },
  grid: { gap: 14 },
  gridWide: { flexDirection: 'row', alignItems: 'stretch' },
  panel: { backgroundColor: Palette.white, borderRadius: 26, padding: 20 },
  schedulePanel: { flex: 1.6 },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12 },
  sectionEyebrow: { color: Palette.coralDark, fontSize: 11, fontWeight: '900', letterSpacing: 1.1 },
  sectionTitle: { color: Palette.ink, fontSize: 23, fontWeight: '900', marginTop: 3 },
  textButton: { color: Palette.coralDark, fontSize: 13, fontWeight: '800' },
  timeline: { marginTop: 24 },
  timelineRow: { minHeight: 72, flexDirection: 'row' },
  time: { width: 52, color: Palette.ink, fontSize: 13, fontWeight: '900' },
  rail: { width: 24, alignItems: 'center' },
  dot: { width: 11, height: 11, borderRadius: 6, borderWidth: 2, borderColor: Palette.white },
  line: { width: 1, flex: 1, backgroundColor: Palette.line, marginVertical: 4 },
  stopCopy: { flex: 1, paddingBottom: 16 },
  stopTitle: { color: Palette.ink, fontSize: 15, fontWeight: '800' },
  stopNote: { color: Palette.muted, fontSize: 13, lineHeight: 19, marginTop: 3 },
  sideColumn: { flex: 1, gap: 14 },
  miniCard: { flex: 1, minHeight: 152, borderRadius: 26, padding: 20, justifyContent: 'space-between' },
  ticketCard: { backgroundColor: Palette.sky },
  packingCard: { backgroundColor: Palette.sun },
  miniCardTop: { flexDirection: 'row', justifyContent: 'space-between' },
  miniKicker: { color: '#24474F', fontSize: 10, fontWeight: '900', letterSpacing: 1.1 },
  miniKickerDark: { color: '#684D0B', fontSize: 10, fontWeight: '900', letterSpacing: 1.1 },
  miniValue: { color: Palette.ink, fontSize: 45, lineHeight: 49, fontWeight: '900', marginTop: 10 },
  miniLabel: { color: '#24474F', fontSize: 14, fontWeight: '700' },
  cardArrow: { position: 'absolute', right: 20, bottom: 20, color: Palette.ink, fontSize: 22, fontWeight: '900' },
  cardArrowDark: { color: '#684D0B', fontSize: 22, fontWeight: '900' },
  packingValue: { color: Palette.ink, fontSize: 27, fontWeight: '900', marginTop: 12 },
  progressTrack: { height: 7, borderRadius: 999, backgroundColor: '#E9BC50', overflow: 'hidden', marginTop: 12 },
  progressFill: { width: '67%', height: '100%', borderRadius: 999, backgroundColor: Palette.ink },
  packingNote: { color: '#684D0B', fontSize: 13, fontWeight: '700', marginTop: 9 },
  pressed: { opacity: 0.74, transform: [{ scale: 0.985 }] },
});
