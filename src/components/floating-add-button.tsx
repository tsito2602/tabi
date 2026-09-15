import type { GestureResponderEvent } from 'react-native';
import { useThemedStyles } from '@/theme/theme-provider';
import { useContext, useEffect, useRef } from 'react';
import { PageActionContext } from './page-action-context';
import { useDesktop } from '@/hooks/use-desktop';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { type Palette } from '@/constants/design';

export function FloatingAddButton({ label, onPress }: { label: string; onPress: (event: GestureResponderEvent) => void }) {
  const styles = useThemedStyles(createStyles);

  const desktop = useDesktop();
  const { setAction } = useContext(PageActionContext);
  const handler = useRef(onPress);
  useEffect(() => { handler.current = onPress; }, [onPress]);
  useEffect(() => {
    if (!desktop) return;
    setAction({ label, run: (event) => handler.current(event) });
    return () => setAction(null);
  }, [desktop, label, setAction]);
  const insets = useSafeAreaInsets();

  if (desktop) return null;
  return (
    <View testID="page-add-action" pointerEvents="box-none" style={styles.overlay}>
      <View pointerEvents="box-none" style={[styles.rail, { paddingBottom: Math.max(insets.bottom, 12) + 16 }]}>
        <Pressable
          accessibilityLabel={label}
          accessibilityRole="button"
          onPress={onPress}
          style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
          <Text style={styles.mark}>＋</Text>
        </Pressable>
      </View>
    </View>
  );
}

const createStyles = (palette: Palette) => StyleSheet.create({
  overlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 20 },
  rail: { flex: 1, width: '100%', maxWidth: 800, alignSelf: 'center', alignItems: 'flex-end', justifyContent: 'flex-end', paddingHorizontal: 20 },
  button: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.ocean },
  mark: { color: palette.onOcean, fontSize: 30, lineHeight: 32, fontWeight: '500', marginTop: -2 },
  pressed: { opacity: 0.68, transform: [{ scale: 0.94 }] },
});
