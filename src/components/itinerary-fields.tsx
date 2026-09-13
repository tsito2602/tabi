import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import type { ComponentProps } from 'react';
import { DateRangePicker } from './date-range-picker';
import { durationLabel, durationMinutes, itineraryCategories, transportModes } from '@/data/itinerary';
import type { ItineraryCategory, ItineraryDetails } from '@/data/types';
import type { Palette } from '@/constants/design';
import { usePalette, useThemedStyles } from '@/theme/theme-provider';

type IconName = ComponentProps<typeof SymbolView>['name'];
export function ItineraryCategoryPicker({ value, onChange, linkedPlace = false }: { value: ItineraryCategory; onChange: (value: ItineraryCategory) => void; linkedPlace?: boolean }) {
  const styles = useThemedStyles(createStyles);
  const palette = usePalette();
  return <View><Text style={styles.label}>カテゴリ</Text><View style={styles.choices}>
    {itineraryCategories.filter((category) => !linkedPlace || category.value !== 'transport').map((category) => <Pressable key={category.value} accessibilityRole="button" accessibilityState={{ selected: category.value === value }} onPress={() => onChange(category.value)} style={[styles.choice, category.value === value && styles.selected]}>
      <SymbolView name={{ ios: category.ios, android: category.icon, web: category.icon } as IconName} size={19} tintColor={category.value === value ? palette.onOcean : palette.ocean} />
      <Text style={[styles.choiceText, category.value === value && styles.selectedText]}>{category.label}</Text>
    </Pressable>)}
  </View></View>;
}
export function ItineraryFields({ day, time, details, onChange, linkedPlace = false }: { day: string; time: string; details: ItineraryDetails; onChange: (details: ItineraryDetails) => void; linkedPlace?: boolean }) {
  const styles = useThemedStyles(createStyles);
  const palette = usePalette();
  const moving = details.category === 'transport';
  const transport = details.transport ?? { mode: 'walk' as const, origin: '', destination: '' };
  const field = (label: string, value: string, onChangeText: (text: string) => void, placeholder: string) => <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput accessibilityLabel={label} maxLength={160} value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={palette.placeholder} style={styles.input} /></View>;
  return <View>
    {moving ? <>
      <Text style={styles.label}>移動手段</Text><View style={styles.choices}>{transportModes.map((mode) => <Pressable key={mode.value} accessibilityRole="button" accessibilityState={{ selected: transport.mode === mode.value }} onPress={() => onChange({ ...details, transport: { ...transport, mode: mode.value } })} style={[styles.choice, transport.mode === mode.value && styles.selected]}>
        <Text style={[styles.choiceText, transport.mode === mode.value && styles.selectedText]}>{mode.label}</Text>
      </Pressable>)}</View>
      <View style={styles.endpoints}>{field('出発地', transport.origin, (origin) => onChange({ ...details, transport: { ...transport, origin } }), 'ホテル・駅など')}{field('到着地', transport.destination, (destination) => onChange({ ...details, transport: { ...transport, destination } }), '次の目的地')}</View>
    </> : !linkedPlace ? field(details.category === 'meal' ? 'お店' : details.category === 'shopping' ? 'お店・エリア' : '場所', details.location, (location) => onChange({ ...details, location }), details.category === 'meal' ? 'レストラン・カフェの名前' : '場所の名前（任意）') : null}
    {details.endDay ? <View style={styles.endDate}>
      <DateRangePicker mode="single" showTime label={moving ? '到着' : '終了'} startDate={details.endDay} endDate={details.endDay} startTime={details.endTime} onChange={(range) => onChange({ ...details, endDay: range.startDate, endTime: range.startTime })} />
      <Pressable accessibilityRole="button" onPress={() => onChange({ ...details, endDay: '', endTime: '' })} style={styles.textButton}><Text style={styles.actionText}>{moving ? '到着日時を外す' : '終了日時を外す'}</Text></Pressable>
    </View> : <Pressable accessibilityRole="button" onPress={() => onChange({ ...details, endDay: day, endTime: '' })} style={styles.textButton}><Text style={styles.actionText}>＋ {moving ? '到着日時' : '終了日時'}を追加</Text></Pressable>}
    {moving ? time && details.endTime ? <Text style={styles.duration}>所要時間　{durationLabel(durationMinutes(day, time, details)) || '日時を確認してください'}</Text> : <View><Text style={styles.label}>所要時間（分・任意）</Text><TextInput accessibilityLabel="所要時間（分）" inputMode="numeric" maxLength={5} value={transport.durationMinutes === undefined ? '' : String(transport.durationMinutes)} onChangeText={(value) => onChange({ ...details, transport: { ...transport, durationMinutes: value ? Number(value) : undefined } })} placeholder="20" placeholderTextColor={palette.placeholder} style={styles.input} /></View> : null}
  </View>;
}
const createStyles = (palette: Palette) => StyleSheet.create({
  label: { color: palette.slate, fontSize: 12, fontWeight: '600', marginTop: 18, marginBottom: 8 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: { minHeight: 44, paddingHorizontal: 13, paddingVertical: 10, borderRadius: 12, backgroundColor: palette.soft, flexDirection: 'row', alignItems: 'center', gap: 6 },
  selected: { backgroundColor: palette.ocean }, choiceText: { color: palette.slate, fontSize: 13, fontWeight: '600' }, selectedText: { color: palette.onOcean },
  endpoints: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 }, field: { flex: 1, minWidth: 140 },
  input: { color: palette.ink, backgroundColor: palette.soft, borderRadius: 10, padding: 14, minHeight: 48, fontSize: 16 },
  endDate: { marginTop: 18 }, textButton: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start', paddingVertical: 10 }, actionText: { color: palette.ocean, fontSize: 13, fontWeight: '600' },
  duration: { color: palette.slate, fontSize: 14, paddingVertical: 8 },
});
