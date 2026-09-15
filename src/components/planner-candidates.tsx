import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTravel } from '@/data/travel-provider';
import type { PlanSource } from '@/data/planner';
import { useDesktop } from '@/hooks/use-desktop';
import { usePalette, useThemedStyles } from '@/theme/theme-provider';
import { type Palette } from '@/constants/design';
import { formatDate } from '@/utils/dates';
import { captureDetailOrigin, type DetailOrigin } from '@/utils/detail-origin';
import { MotionPresence } from './motion-presence';
import { PlaceSheet } from './place-sheet';
import { FormSheet } from './form-sheet';
import { PlannerCard, PlannerHandle } from './planner-drag';
import { SurfaceCard, CardContent } from './ui/surface-card';
import { ActionButton } from './ui/action-button';

export function PlannerCandidates({ source, onSelect, onViewItem }: {
  source: PlanSource | null; onSelect: (source: PlanSource | null) => void; onViewItem: (id: string) => void;
}) {
  const { places, items, canEdit } = useTravel();
  const p = usePalette(), s = useThemedStyles(createStyles);
  const desktop = useDesktop(), { height } = useWindowDimensions(), insets = useSafeAreaInsets();
  const compact = !desktop && height < 520;
  const [search, setSearch] = useState(''), [picker, setPicker] = useState(false), [expanded, setExpanded] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null), [origin, setOrigin] = useState<DetailOrigin>();
  const filtered = places.filter(place => `${place.title} ${place.note}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const cards = (selectOnly = false) => <>
    {filtered.map(place => {
      const linked = items.find(i => i.id === place.itineraryItemId), selected = source?.kind === 'place' && source.id === place.id;
      return <PlannerCard key={place.id}><SurfaceCard testID="planner-candidate" selected={selected}>
        <View style={s.row}><CardContent title={place.title} meta={linked ? `${formatDate(linked.day)} · 配置済み` : place.openingHours || undefined}
          icon={<SymbolView name={{ ios: 'mappin', android: 'location_on', web: 'location_on' }} size={20} tintColor={p.smoke} />}
          onPress={() => { setPicker(false); setExpanded(false); if (linked) onViewItem(linked.id); else onSelect(selected ? null : { kind: 'place', id: place.id }); }}
          accessibilityLabel={linked ? `${place.title}のしおりを見る` : `${place.title}を配置する`} />
          {!linked && canEdit && !selectOnly ? <PlannerHandle label={place.title} source={{ kind: 'place', id: place.id }} /> : null}
        </View>
        <View style={s.footer}><Text style={s.caption}>{linked ? '行きたい場所にも保存済み' : selected ? '配置先を選択してください' : '時刻は後で設定できます'}</Text>
          <ActionButton label="詳細" variant="quiet" onPress={event => { setOrigin(captureDetailOrigin(event)); setViewing(place.id); }} />
        </View>
      </SurfaceCard></PlannerCard>;
    })}
    {!filtered.length ? <Text style={s.empty}>{places.length ? '一致する場所がありません' : '行きたい場所を保存して、ここから予定を組みましょう。'}</Text> : null}
  </>;
  // On a short landscape viewport a compact selector leaves the itinerary
  // readable; full-screen search uses the existing keyboard-safe FormSheet.
  return <View testID="planner-panel" style={[s.panel, desktop ? s.desktop : compact ? { paddingBottom: Math.max(insets.bottom, 4) } : { height: Math.max(180, Math.min(expanded ? 360 : 260, height * (expanded ? .46 : .32))), paddingBottom: Math.max(insets.bottom, 8) }]}>
    <View style={s.header}><View style={{ flex: 1, minWidth: 0 }}><Text accessibilityRole="header" style={s.heading}>行きたい場所</Text></View>
      {!desktop ? <ActionButton label={compact ? '候補を選ぶ' : '検索'} variant="quiet" onPress={event => { setOrigin(captureDetailOrigin(event)); setPicker(true); }} /> : null}
      {!desktop && !compact ? <ActionButton label={expanded ? '縮小' : '拡大'} variant="quiet" onPress={() => setExpanded(v => !v)} /> : null}
      {canEdit ? <ActionButton label="追加" variant="quiet" onPress={event => { setOrigin(captureDetailOrigin(event)); setViewing('new'); }} /> : null}
    </View>
    {desktop ? <TextInput accessibilityLabel="配置する場所を検索" value={search} onChangeText={setSearch} placeholder="候補を検索" placeholderTextColor={p.placeholder} style={s.search} /> : null}
    {!compact ? <ScrollView testID="planner-candidates" keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={s.list}>{cards()}</ScrollView> : null}
    <MotionPresence>{picker ? <FormSheet detailOrigin={origin} visible title="配置する場所を選ぶ" onClose={() => setPicker(false)}>
      <TextInput accessibilityLabel="配置する場所を検索" autoFocus value={search} onChangeText={setSearch} placeholder="候補を検索" placeholderTextColor={p.placeholder} style={s.search} />
      <View style={s.list}>{cards(true)}</View>
    </FormSheet> : null}</MotionPresence>
    <MotionPresence>{viewing && (viewing === 'new' || places.some(place => place.id === viewing)) ? <PlaceSheet key={viewing} detailOrigin={origin} place={places.find(p => p.id === viewing)} onClose={() => setViewing(null)} /> : null}</MotionPresence>
  </View>;
}
const createStyles = (p: Palette) => StyleSheet.create({
  panel: { flexShrink: 0, minHeight: 0, backgroundColor: p.canvas, borderTopWidth: 1, borderColor: p.ash, paddingHorizontal: 16, paddingTop: 8, gap: 8 },
  desktop: { width: 320, flex: 1, flexGrow: 0, borderTopWidth: 0, borderLeftWidth: 1, paddingVertical: 20 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 0 }, heading: { color: p.ink, fontSize: 16, lineHeight: 24, fontWeight: '600' },
  caption: { color: p.smoke, fontSize: 12, lineHeight: 18, flexShrink: 1 },
  search: { color: p.ink, fontSize: 16, minHeight: 44, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: p.paper, borderWidth: 1, borderColor: p.ash, borderRadius: 12 },
  list: { gap: 12, paddingBottom: 20 }, row: { flexDirection: 'row', alignItems: 'center', minWidth: 0 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingLeft: 16, paddingRight: 4, borderTopWidth: StyleSheet.hairlineWidth, borderColor: p.ash },
  empty: { padding: 16, color: p.smoke, lineHeight: 22, fontSize: 14 },
});
