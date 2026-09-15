import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTravel } from '@/data/travel-provider';
import type { PlanSource } from '@/data/planner';
import { usePalette, useThemedStyles } from '@/theme/theme-provider';
import { type Palette } from '@/constants/design';
import { captureDetailOrigin, type DetailOrigin } from '@/utils/detail-origin';
import { MotionPresence } from './motion-presence';
import { PlaceSheet } from './place-sheet';
import { FormSheet } from './form-sheet';
import { PlannerCard, PlannerHandle } from './planner-drag';
import { ActionButton } from './ui/action-button';

export function PlannerCandidates({ source, disabled = false }: { source: PlanSource | null; disabled?: boolean; onSelect?: (source: PlanSource | null) => void; onViewItem?: (id: string) => void }) {
  const { places, items, canEdit } = useTravel();
  const p = usePalette(), s = useThemedStyles(createStyles);
  const { height } = useWindowDimensions(), insets = useSafeAreaInsets();
  const compact = height < 520;
  const [search, setSearch] = useState(''), [picker, setPicker] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null), [origin, setOrigin] = useState<DetailOrigin>();
  const filtered = places.filter(place => `${place.title} ${place.note}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const cards = (searching = false) => <>
    {(searching ? filtered : places).map(place => {
      const linked = items.find(item => item.id === place.itineraryItemId);
      // A saved candidate moves the existing item; it must not make a duplicate.
      const planSource: PlanSource = linked ? { kind: 'item', id: linked.id } : { kind: 'place', id: place.id };
      const selected = source?.kind === planSource.kind && source.id === planSource.id;
      return <View key={place.id} style={s.cell}>
        <PlannerCard source={canEdit && !searching ? planSource : undefined} gesture="lift" disabled={disabled}>
          <Pressable testID="planner-candidate" accessibilityRole="button" accessibilityLabel={`${place.title}の詳細を開く`}
            onPress={event => { setOrigin(captureDetailOrigin(event)); setPicker(false); setViewing(place.id); }}
            style={[s.card, compact && s.compactCard, selected && s.selected]}>
            <Text numberOfLines={3} style={s.title}>{place.title}</Text>
          </Pressable>
          {canEdit && !searching ? <PlannerHandle label={place.title} source={planSource} disabled={disabled} /> : null}
        </PlannerCard>
      </View>;
    })}
    {!(searching ? filtered : places).length ? <Text style={s.empty}>{places.length ? '一致する場所がありません' : '行きたい場所はまだありません'}</Text> : null}
  </>;
  return <View testID="planner-panel" style={[s.panel, { paddingBottom: Math.max(insets.bottom, 8) }]}>
    <View style={s.header}><Text accessibilityRole="header" style={s.heading}>行きたい場所</Text>
      <ActionButton label="検索" variant="quiet" onPress={event => { setOrigin(captureDetailOrigin(event)); setPicker(true); }} />
    </View>
    <ScrollView testID="planner-candidates" horizontal keyboardShouldPersistTaps="handled" showsHorizontalScrollIndicator={false}
      style={s.scroller} contentContainerStyle={s.list}>{cards()}</ScrollView>
    <MotionPresence>{picker ? <FormSheet detailOrigin={origin} visible title="行きたい場所を検索" onClose={() => setPicker(false)}>
      <TextInput accessibilityLabel="配置する場所を検索" autoFocus value={search} onChangeText={setSearch} placeholder="候補を検索" placeholderTextColor={p.placeholder} style={s.search} />
      <ScrollView horizontal keyboardShouldPersistTaps="handled" showsHorizontalScrollIndicator={false} contentContainerStyle={s.list}>{cards(true)}</ScrollView>
    </FormSheet> : null}</MotionPresence>
    <MotionPresence>{viewing && places.some(place => place.id === viewing) ? <PlaceSheet key={viewing} detailOrigin={origin} place={places.find(place => place.id === viewing)} onClose={() => setViewing(null)} /> : null}</MotionPresence>
  </View>;
}
const createStyles = (p: Palette) => StyleSheet.create({
  panel: { flexShrink: 0, minHeight: 0, backgroundColor: p.canvas, borderTopWidth: 1, borderColor: p.ash, paddingTop: 4, gap: 4 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 },
  heading: { color: p.ink, fontSize: 15, lineHeight: 22, fontWeight: '600', flexShrink: 1 },
  scroller: { flexGrow: 0 }, list: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingVertical: 4, alignItems: 'stretch' },
  cell: { width: 152, flexShrink: 0 },
  card: { minHeight: 88, paddingHorizontal: 14, paddingVertical: 12, justifyContent: 'center', backgroundColor: p.paper, borderRadius: 16, borderWidth: 1, borderColor: p.ash },
  compactCard: { minHeight: 72 }, selected: { borderColor: p.ocean, backgroundColor: p.sky },
  title: { color: p.ink, fontSize: 15, lineHeight: 21, fontWeight: '600' },
  search: { color: p.ink, fontSize: 16, minHeight: 44, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: p.paper, borderWidth: 1, borderColor: p.ash, borderRadius: 12, marginBottom: 12 },
  empty: { paddingVertical: 20, color: p.smoke, lineHeight: 22, fontSize: 14, maxWidth: 300 },
});
