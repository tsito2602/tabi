import type { PropsWithChildren, ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type GestureResponderEvent, type StyleProp, type ViewStyle } from 'react-native';
import { radii, type Palette } from '@/constants/design';
import { useThemedStyles } from '@/theme/theme-provider';

/** One surface vocabulary for a saved place, itinerary entry and reservation. */
export function SurfaceCard({ children, selected = false, style, testID }: PropsWithChildren<{
  selected?: boolean; style?: StyleProp<ViewStyle>; testID?: string;
}>) {
  const styles = useThemedStyles(createStyles);
  return <View testID={testID} style={[styles.surface, selected && styles.selected, style]}>{children}</View>;
}

export function CardContent({ title, icon, meta, children, onPress, accessibilityLabel, testID }: PropsWithChildren<{
  title: string; icon?: ReactNode; meta?: string; onPress?: (event: GestureResponderEvent) => void;
  accessibilityLabel?: string; testID?: string;
}>) {
  const styles = useThemedStyles(createStyles);
  const content = <>
    <View style={styles.heading}>{icon ? <View style={styles.icon}>{icon}</View> : null}
      <Text testID="detail-source-title" style={styles.title}>{title}</Text>
    </View>
    {meta ? <Text style={styles.meta}>{meta}</Text> : null}
    {children}
  </>;
  return onPress
    ? <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? `${title}の詳細を開く`} onPress={onPress}
        style={({ pressed }) => [styles.content, pressed && styles.pressed]}>{content}</Pressable>
    : <View testID={testID} style={styles.content}>{content}</View>;
}

const createStyles = (p: Palette) => StyleSheet.create({
  surface: { minWidth: 0, borderRadius: radii.card, borderWidth: 1, borderColor: p.ash, backgroundColor: p.paper, overflow: 'hidden' },
  selected: { borderColor: p.ocean, backgroundColor: p.sky },
  content: { minWidth: 0, minHeight: 72, padding: 16, gap: 8, justifyContent: 'center', flex: 1 },
  heading: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  icon: { minWidth: 22, minHeight: 24, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, minWidth: 0, fontSize: 17, lineHeight: 25, fontWeight: '600', color: p.ink },
  meta: { fontSize: 12, lineHeight: 19, color: p.smoke },
  pressed: { backgroundColor: p.soft },
});
