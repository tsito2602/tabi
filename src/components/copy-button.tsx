import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { motionMs } from '@/utils/motion';
import { useThemedStyles } from '@/theme/theme-provider';
import * as Clipboard from 'expo-clipboard';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, Text } from 'react-native';
import { type Palette } from '@/constants/design';

export function CopyButton({ value, label = 'コピー' }: { value: string; label?: string }) {
  const reduced = useReducedMotion();
  const styles = useThemedStyles(createStyles);

  const [state, setState] = useState<'idle' | 'copied' | 'error'>('idle');
  const [motion] = useState(() => new Animated.Value(1));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const busy = useRef(false);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const copy = async () => {
    if (busy.current) return;
    busy.current = true;
    try { setState(await Clipboard.setStringAsync(value) ? 'copied' : 'error'); }
    catch { setState('error'); }
    finally { busy.current = false; }
    if (timer.current) clearTimeout(timer.current);
    motion.setValue(0);
    Animated.timing(motion, { toValue: 1, duration: reduced ? 0 : motionMs('--icon-swap-dur', 250), easing: Easing.inOut(Easing.ease), useNativeDriver: Platform.OS !== 'web' }).start();
    timer.current = setTimeout(() => setState('idle'), 2000);
  };
  return <Pressable accessibilityRole="button" accessibilityLabel={state === 'copied' ? 'コピーしました' : state === 'error' ? 'コピーできませんでした。長押しでコピーしてください' : label} onPress={() => void copy()} style={styles.button}>
    <Animated.View style={{ opacity: motion, transform: [{ scale: motion.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }] }}>
      <Text style={[styles.text, state === 'copied' && styles.check, state === 'error' && styles.error]}>{state === 'copied' ? '✓' : state === 'error' ? '再試行' : label}</Text>
    </Animated.View>
  </Pressable>;
}
const createStyles = (palette: Palette) => StyleSheet.create({
  button: { minWidth: 76, minHeight: 44, paddingHorizontal: 12, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.sky },
  text: { color: palette.ocean, fontSize: 12, fontWeight: '700' },
  check: { fontSize: 22, lineHeight: 26 },
  error: { color: palette.danger },
});
