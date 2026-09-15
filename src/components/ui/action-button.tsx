import { Pressable, StyleSheet, Text, type GestureResponderEvent } from 'react-native';
import { radii, type Palette } from '@/constants/design';
import { useThemedStyles } from '@/theme/theme-provider';

export function ActionButton({ label, onPress, variant = 'secondary', disabled = false, selected, testID, accessibilityLabel }: {
  label: string; onPress: (event: GestureResponderEvent) => void;
  variant?: 'primary' | 'secondary' | 'quiet' | 'danger'; disabled?: boolean; selected?: boolean; testID?: string; accessibilityLabel?: string;
}) {
  const s = useThemedStyles(createStyles);
  return <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} accessibilityState={{ disabled, selected }} disabled={disabled}
    onPress={onPress} style={({ pressed }) => [s.button, s[variant], selected && s.selected, disabled && s.disabled, pressed && !disabled && s.pressed]}>
    <Text style={[s.label, variant === 'primary' && s.onPrimary, variant === 'danger' && s.dangerText, selected && s.selectedText]}>{label}</Text>
  </Pressable>;
}
const createStyles = (p: Palette) => StyleSheet.create({
  button: { minHeight: 44, minWidth: 44, paddingVertical: 10, paddingHorizontal: 14, borderRadius: radii.button, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  primary: { backgroundColor: p.ocean, borderColor: p.ocean },
  secondary: { backgroundColor: p.paper, borderColor: p.ash },
  quiet: { backgroundColor: 'transparent', borderColor: 'transparent' },
  danger: { backgroundColor: p.paper, borderColor: p.ash },
  selected: { backgroundColor: p.sky, borderColor: p.ocean },
  label: { fontSize: 14, lineHeight: 21, fontWeight: '600', color: p.ink },
  onPrimary: { color: p.onOcean }, dangerText: { color: p.danger }, selectedText: { color: p.ocean },
  disabled: { opacity: 0.4 }, pressed: { opacity: 0.75 },
});
