import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { ScreenShell } from '@/components/screen-shell';
import { Palette } from '@/constants/theme';

type Owner = 'すべて' | 'つばさ' | 'みさき' | '共通';
type Item = { id: number; label: string; owner: Exclude<Owner, 'すべて'>; done: boolean; category: string };

const seed: Item[] = [
  { id: 1, label: '航空券・予約確認', owner: '共通', done: true, category: '大事なもの' },
  { id: 2, label: 'モバイルバッテリー', owner: 'つばさ', done: true, category: 'ガジェット' },
  { id: 3, label: '折りたたみ傘', owner: 'みさき', done: false, category: 'あると安心' },
  { id: 4, label: '常備薬', owner: 'つばさ', done: false, category: 'あると安心' },
  { id: 5, label: '日焼け止め', owner: 'みさき', done: false, category: '身のまわり' },
  { id: 6, label: 'レンタカー免許証', owner: 'つばさ', done: true, category: '大事なもの' },
];

const owners: Owner[] = ['すべて', 'つばさ', 'みさき', '共通'];

export default function PackingScreen() {
  const [items, setItems] = useState(seed);
  const [owner, setOwner] = useState<Owner>('すべて');
  const [newItem, setNewItem] = useState('');
  const shown = useMemo(() => owner === 'すべて' ? items : items.filter((item) => item.owner === owner), [items, owner]);
  const completed = items.filter((item) => item.done).length;
  const percent = Math.round((completed / items.length) * 100);

  const addItem = () => {
    if (!newItem.trim()) return;
    setItems((current) => [...current, { id: Date.now(), label: newItem.trim(), owner: '共通', done: false, category: '追加したもの' }]);
    setNewItem('');
  };

  return (
    <ScreenShell kicker="出発前のチームプレイ" title="持ち物">
      <View style={styles.scoreCard}>
        <View style={styles.scoreTop}>
          <View><Text style={styles.scoreKicker}>PACKING SCORE</Text><Text style={styles.scoreTitle}>準備は、いい調子。</Text></View>
          <View style={styles.scoreBubble}><Text style={styles.scoreValue}>{percent}</Text><Text style={styles.scoreUnit}>%</Text></View>
        </View>
        <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${percent}%` }]} /></View>
        <View style={styles.legend}><Text style={styles.legendText}>{completed}個できた</Text><Text style={styles.legendText}>残り {items.length - completed}個</Text></View>
      </View>

      <View style={styles.filters} accessibilityRole="tablist">
        {owners.map((name) => <Pressable key={name} accessibilityRole="tab" accessibilityState={{ selected: owner === name }} onPress={() => setOwner(name)} style={[styles.filter, owner === name && styles.filterActive]}><Text style={[styles.filterText, owner === name && styles.filterTextActive]}>{name}</Text></Pressable>)}
      </View>

      <View style={styles.listCard}>
        {shown.map((item, index) => (
          <Pressable key={item.id} accessibilityRole="checkbox" accessibilityState={{ checked: item.done }} onPress={() => setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, done: !entry.done } : entry))} style={({ pressed }) => [styles.row, index < shown.length - 1 && styles.rowBorder, pressed && styles.pressed]}>
            <View style={[styles.checkbox, item.done && styles.checkboxDone]}>{item.done ? <Text style={styles.check}>✓</Text> : null}</View>
            <View style={styles.itemCopy}><Text style={[styles.itemLabel, item.done && styles.itemDone]}>{item.label}</Text><Text style={styles.category}>{item.category}</Text></View>
            <View style={[styles.ownerTag, item.owner === 'つばさ' ? styles.ownerTsubasa : item.owner === 'みさき' ? styles.ownerMisaki : styles.ownerShared]}><Text style={styles.ownerText}>{item.owner}</Text></View>
          </Pressable>
        ))}
        {shown.length === 0 ? <View style={styles.empty}><Text style={styles.emptyTitle}>この担当の持ち物はありません</Text><Text style={styles.emptyNote}>下から追加すると「共通」に入ります</Text></View> : null}
      </View>

      <View style={styles.addRow}>
        <TextInput accessibilityLabel="新しい持ち物" value={newItem} onChangeText={setNewItem} onSubmitEditing={addItem} placeholder="忘れたくないものを追加" placeholderTextColor="#89928E" returnKeyType="done" style={styles.input} />
        <Pressable accessibilityLabel="持ち物を追加する" onPress={addItem} style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}><Text style={styles.addButtonText}>追加</Text></Pressable>
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  scoreCard: { backgroundColor: Palette.ink, borderRadius: 30, padding: 22 },
  scoreTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 16 },
  scoreKicker: { color: Palette.sky, fontSize: 10, fontWeight: '900', letterSpacing: 1.3 },
  scoreTitle: { color: Palette.white, fontSize: 22, fontWeight: '900', marginTop: 6 },
  scoreBubble: { width: 76, height: 76, borderRadius: 38, backgroundColor: Palette.sun, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', paddingTop: 21, transform: [{ rotate: '5deg' }] },
  scoreValue: { color: Palette.ink, fontSize: 27, lineHeight: 31, fontWeight: '900' },
  scoreUnit: { color: Palette.ink, fontSize: 12, fontWeight: '900' },
  progressTrack: { height: 9, borderRadius: 999, backgroundColor: '#3D514E', overflow: 'hidden', marginTop: 25 },
  progressFill: { height: '100%', borderRadius: 999, backgroundColor: Palette.coral },
  legend: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 9 },
  legendText: { color: '#AFC0BC', fontSize: 12, fontWeight: '700' },
  filters: { flexDirection: 'row', gap: 7 },
  filter: { flex: 1, minHeight: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: Palette.white },
  filterActive: { backgroundColor: Palette.coral },
  filterText: { color: Palette.muted, fontSize: 12, fontWeight: '800' },
  filterTextActive: { color: Palette.white },
  listCard: { backgroundColor: Palette.white, borderRadius: 25, paddingHorizontal: 17, overflow: 'hidden' },
  row: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: '#E8E9E3' },
  checkbox: { width: 29, height: 29, borderRadius: 10, borderWidth: 2, borderColor: '#ADB5B0', alignItems: 'center', justifyContent: 'center' },
  checkboxDone: { backgroundColor: Palette.ink, borderColor: Palette.ink },
  check: { color: Palette.sun, fontSize: 16, fontWeight: '900' },
  itemCopy: { flex: 1 },
  itemLabel: { color: Palette.ink, fontSize: 15, fontWeight: '800' },
  itemDone: { color: '#929A96', textDecorationLine: 'line-through' },
  category: { color: Palette.muted, fontSize: 11, marginTop: 4 },
  ownerTag: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5 },
  ownerTsubasa: { backgroundColor: Palette.skySoft },
  ownerMisaki: { backgroundColor: '#FFE5DE' },
  ownerShared: { backgroundColor: '#F3E9C9' },
  ownerText: { color: Palette.ink, fontSize: 10, fontWeight: '800' },
  empty: { paddingVertical: 38, alignItems: 'center' },
  emptyTitle: { color: Palette.ink, fontSize: 15, fontWeight: '800' },
  emptyNote: { color: Palette.muted, fontSize: 12, marginTop: 5 },
  addRow: { flexDirection: 'row', gap: 9 },
  input: { flex: 1, minHeight: 54, borderRadius: 18, backgroundColor: Palette.white, paddingHorizontal: 16, color: Palette.ink, fontSize: 15 },
  addButton: { minWidth: 70, minHeight: 54, borderRadius: 18, backgroundColor: Palette.coral, alignItems: 'center', justifyContent: 'center' },
  addButtonText: { color: Palette.white, fontSize: 14, fontWeight: '900' },
  pressed: { opacity: 0.65 },
});
