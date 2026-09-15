import { usePalette } from '@/theme/theme-provider';
import { Text, View } from 'react-native';
import { useDesktop } from '@/hooks/use-desktop';

export function PageHeading({ title, count }: { title: string; count?: string }) {
  const palette = usePalette();
  const desktop = useDesktop();
  if (!desktop) return null;
  return <View testID="page-heading" style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 }}><Text accessibilityRole="header" style={{ color: palette.ink, fontSize: 22, lineHeight: 30, fontWeight: '600' }}>{title}</Text>{count ? <Text style={{ color: palette.smoke, fontSize: 13 }}>{count}</Text> : null}</View>;
}
