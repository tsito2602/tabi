import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { motionMs } from '@/utils/motion';
import { useThemedStyles } from '@/theme/theme-provider';
import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { type Palette } from '@/constants/design';

const ToastContext = createContext<{ show: (message: string) => void; message: string; progress: Animated.Value } | null>(null);
export const useToast = () => useContext(ToastContext)!.show;

export function ToastProvider({ children }: PropsWithChildren) {
  const reduced = useReducedMotion();
  const [message, setMessage] = useState('');
  const [progress] = useState(() => new Animated.Value(0));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((next: string) => {
    if (timer.current) clearTimeout(timer.current);
    progress.stopAnimation();
    progress.setValue(0);
    setMessage(next);
    Animated.timing(progress, { toValue: 1, duration: reduced ? 0 : motionMs('--toast-open', 350), easing: Easing.bezier(0.22, 1, 0.36, 1), useNativeDriver: Platform.OS !== 'web' }).start();
    timer.current = setTimeout(() => {
      Animated.timing(progress, { toValue: 0, duration: reduced ? 0 : motionMs('--toast-close', 250), easing: Easing.bezier(0.22, 1, 0.36, 1), useNativeDriver: Platform.OS !== 'web' }).start();
    }, 3600);
  }, [progress, reduced]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return <ToastContext.Provider value={{ show, message, progress }}>{children}<ToastHost /></ToastContext.Provider>;
}

// A sheet has its own native modal layer, so it also hosts the same toast.
export function ToastHost() {
  const styles = useThemedStyles(createStyles);

  const toast = useContext(ToastContext);
  const insets = useSafeAreaInsets();
  if (!toast) return null;
  return <View pointerEvents="none" style={[styles.position, { bottom: insets.bottom + 28 }]}>
    <Animated.View testID="toast" style={[styles.toast, { opacity: toast.progress, transform: [{ translateY: toast.progress.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] }]}>
      <Text accessibilityLiveRegion="polite" style={styles.text}>{toast.message}</Text>
    </Animated.View>
  </View>;
}

const createStyles = (palette: Palette) => StyleSheet.create({
  position: { position: 'absolute', left: 24, right: 24, alignItems: 'center', zIndex: 1000 },
  toast: { maxWidth: 440, borderRadius: 16, paddingHorizontal: 20, paddingVertical: 14, backgroundColor: palette.ink },
  text: { color: palette.onOcean, fontSize: 13, lineHeight: 20, textAlign: 'center' },
});
