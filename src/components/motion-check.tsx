import { Text } from 'react-native';
import { usePalette } from '@/theme/theme-provider';
export function MotionCheck({ checked }: { checked: boolean }) {
  const palette = usePalette();
  return <Text style={{ color: palette.onOcean, fontSize: 16 }}>{checked ? '✓' : ''}</Text>;
}
