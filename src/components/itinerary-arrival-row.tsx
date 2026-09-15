import { useLayoutEffect, useRef, type PropsWithChildren } from 'react';
import { Animated, Easing, Platform, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { usePalette } from '@/theme/theme-provider';

type Props = PropsWithChildren<{
  waiting?: boolean;
  entering?: boolean;
  reduced: boolean;
  testID?: string;
  onInterrupt: () => void;
  onLayout: (event: LayoutChangeEvent) => void;
}>;

// Reserve the real row's space throughout the handoff, so neighbouring plans
// never jump and the scroll destination stays valid during the animation.
export function ItineraryArrivalRow({ children, waiting = false, entering = false, reduced, testID, onLayout, onInterrupt }: Props) {
  const palette = usePalette();
  const position = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const highlight = useRef(new Animated.Value(0)).current;
  const played = useRef(false);
  const stop = () => {
    if (waiting || entering) onInterrupt();
    position.stopAnimation(); opacity.stopAnimation(); highlight.stopAnimation();
    position.setValue(1); opacity.setValue(1); highlight.setValue(0);
  };
  useLayoutEffect(() => {
    if (!entering) { played.current = false; return; }
    if (played.current) return;
    played.current = true;
    position.setValue(reduced ? 1 : 0); opacity.setValue(reduced ? 1 : 0);
    highlight.setValue(1);
    const motion = Animated.parallel([
      Animated.timing(position, { toValue: 1, duration: reduced ? 0 : 560, easing: Easing.bezier(.2, .9, .2, 1), useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(opacity, { toValue: 1, duration: reduced ? 0 : 360, easing: Easing.bezier(.3, 0, .35, 1), useNativeDriver: Platform.OS !== 'web' }),
      // Reduced motion retains a quiet, static cue without spatial movement.
      Animated.sequence([
        Animated.delay(reduced ? 900 : 560),
        Animated.timing(highlight, { toValue: 0, duration: reduced ? 0 : 420, useNativeDriver: Platform.OS !== 'web' }),
      ]),
    ]);
    motion.start();
    return () => {
      motion.stop(); position.setValue(1); opacity.setValue(1); highlight.setValue(0);
    };
  }, [entering, reduced, position, opacity, highlight]);
  return <View testID={testID} onLayout={onLayout} onTouchStart={stop}>
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: palette.sky, opacity: highlight }]} />
    <Animated.View style={{ opacity: waiting && !reduced ? 0 : opacity, transform: [{ translateY: position.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] }}>
      {children}
    </Animated.View>
  </View>;
}
