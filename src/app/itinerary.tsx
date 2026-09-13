import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ScreenShell } from '@/components/screen-shell';
import { Palette } from '@/constants/theme';

const days = [
  { id: 1, weekday: '月', date: '14', title: '福岡に到着', color: Palette.coral },
  { id: 2, weekday: '火', date: '15', title: '糸島ドライブ', color: Palette.sky },
  { id: 3, weekday: '水', date: '16', title: '太宰府と帰宅', color: Palette.sun },
];

const plans: Record<number, { time: string; title: string; place: string; kind: string }[]> = {
  1: [
    { time: '10:30', title: '羽田空港を出発', place: '第2ターミナル · ANA 257', kind: '移動' },
    { time: '13:30', title: '博多でラーメン', place: '博多一双 本店', kind: '食べる' },
    { time: '16:00', title: 'ホテルへ', place: 'THE BASICS FUKUOKA', kind: '泊まる' },
    { time: '19:00', title: '中洲で屋台めぐり', place: '気になる店をその場で選ぶ', kind: '寄り道' },
  ],
  2: [
    { time: '09:00', title: 'レンタカーを受け取る', place: '博多駅筑紫口', kind: '移動' },
    { time: '10:30', title: '桜井二見ヶ浦', place: '海辺を散歩', kind: '見る' },
    { time: '12:00', title: '海辺でランチ', place: '糸島エリア', kind: '食べる' },
    { time: '17:30', title: '博多に戻る', place: '給油して返却', kind: '移動' },
  ],
  3: [
    { time: '09:30', title: '太宰府天満宮', place: '参道もゆっくり歩く', kind: '見る' },
    { time: '12:30', title: '福岡空港へ', place: 'お土産は空港で', kind: '移動' },
    { time: '15:10', title: '東京へ', place: 'ANA 260', kind: '移動' },
  ],
};

export default function ItineraryScreen() {
  const [selected, setSelected] = useState(1);
  const day = days[selected - 1];

  return (
    <ScreenShell kicker="SEP 14—16 · FUKUOKA" title="旅の流れ" action={<Pressable accessibilityLabel="予定を追加" style={styles.addButton}><Text style={styles.addButtonText}>＋</Text></Pressable>}>
      <View style={styles.dayStrip} accessibilityRole="tablist">
        {days.map((item) => {
          const active = selected === item.id;
          return (
            <Pressable key={item.id} accessibilityRole="tab" accessibilityState={{ selected: active }} onPress={() => setSelected(item.id)} style={[styles.dayTab, active && { backgroundColor: item.color }]}>
              <Text style={[styles.weekday, active && styles.activeText]}>{item.weekday}</Text>
              <Text style={[styles.date, active && styles.activeText]}>{item.date}</Text>
            </Pressable>
          );
        })}
        <View style={styles.stripCopy}>
          <Text style={styles.stripDay}>DAY {day.id}</Text>
          <Text style={styles.stripTitle}>{day.title}</Text>
        </View>
      </View>

      <View style={styles.routeCard}>
        <View style={styles.routeHeader}>
          <View><Text style={styles.routeKicker}>9月{day.date}日</Text><Text style={styles.routeTitle}>{day.title}</Text></View>
          <View style={[styles.colorChip, { backgroundColor: day.color }]} />
        </View>
        <View style={styles.items}>
          {plans[selected].map((item, index) => (
            <Pressable key={`${selected}-${item.time}`} style={({ pressed }) => [styles.item, pressed && styles.pressed]} accessibilityLabel={`${item.time} ${item.title}`}>
              <Text style={styles.time}>{item.time}</Text>
              <View style={styles.rail}><View style={[styles.node, { backgroundColor: index === 0 ? day.color : Palette.white }]} />{index < plans[selected].length - 1 ? <View style={styles.line} /> : null}</View>
              <View style={styles.itemCopy}>
                <View style={styles.itemTitleRow}><Text style={styles.itemTitle}>{item.title}</Text><Text style={styles.kind}>{item.kind}</Text></View>
                <Text style={styles.place}>{item.place}</Text>
              </View>
            </Pressable>
          ))}
        </View>
        <Pressable style={({ pressed }) => [styles.openSlot, pressed && styles.pressed]}>
          <Text style={styles.openSlotPlus}>＋</Text><View><Text style={styles.openSlotTitle}>寄り道を追加</Text><Text style={styles.openSlotNote}>時間を決めず、行きたい場所だけ残す</Text></View>
        </Pressable>
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  addButton: { width: 46, height: 46, borderRadius: 23, backgroundColor: Palette.ink, alignItems: 'center', justifyContent: 'center' },
  addButtonText: { color: Palette.white, fontSize: 25, fontWeight: '500', marginTop: -2 },
  dayStrip: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Palette.white, borderRadius: 25, padding: 10 },
  dayTab: { width: 52, height: 62, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: Palette.paper },
  weekday: { color: Palette.muted, fontSize: 11, fontWeight: '800' },
  date: { color: Palette.ink, fontSize: 21, lineHeight: 25, fontWeight: '900' },
  activeText: { color: Palette.ink },
  stripCopy: { flex: 1, paddingLeft: 8 },
  stripDay: { color: Palette.coralDark, fontSize: 10, fontWeight: '900', letterSpacing: 1.1 },
  stripTitle: { color: Palette.ink, fontSize: 16, fontWeight: '900', marginTop: 3 },
  routeCard: { backgroundColor: Palette.ink, borderRadius: 30, padding: 22, overflow: 'hidden' },
  routeHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 22, borderBottomWidth: 1, borderBottomColor: '#314643' },
  routeKicker: { color: '#A9BCB8', fontSize: 12, fontWeight: '800' },
  routeTitle: { color: Palette.white, fontSize: 25, fontWeight: '900', marginTop: 4 },
  colorChip: { width: 34, height: 13, borderRadius: 999, transform: [{ rotate: '-8deg' }] },
  items: { paddingTop: 22 },
  item: { minHeight: 86, flexDirection: 'row' },
  time: { width: 56, color: Palette.white, fontSize: 13, fontWeight: '900', paddingTop: 2 },
  rail: { width: 25, alignItems: 'center' },
  node: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: Palette.coral },
  line: { width: 1, flex: 1, backgroundColor: '#405552', marginVertical: 5 },
  itemCopy: { flex: 1, paddingBottom: 20 },
  itemTitleRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  itemTitle: { flex: 1, color: Palette.white, fontSize: 16, fontWeight: '800' },
  kind: { color: Palette.sky, fontSize: 11, fontWeight: '800' },
  place: { color: '#AFC0BC', fontSize: 13, lineHeight: 19, marginTop: 5 },
  openSlot: { flexDirection: 'row', alignItems: 'center', gap: 13, backgroundColor: '#243B38', borderRadius: 20, padding: 16, borderWidth: 1, borderColor: '#3A514E', borderStyle: 'dashed' },
  openSlotPlus: { color: Palette.sun, fontSize: 25 },
  openSlotTitle: { color: Palette.white, fontSize: 14, fontWeight: '800' },
  openSlotNote: { color: '#91A5A1', fontSize: 12, marginTop: 3 },
  pressed: { opacity: 0.65 },
});
