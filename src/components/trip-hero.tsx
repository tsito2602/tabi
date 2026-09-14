import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { createContext, useContext } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { TripCover } from './trip-cover';
import type { Trip } from '@/data/types';

export const TripHeroContext = createContext<{ height: number; scrollY: Animated.Value; setPinAt: (offset: number) => void } | null>(null);
export const useTripHero = () => useContext(TripHeroContext);

// The photo belongs to the viewport; only the journal sheet scrolls over it.
export function TripHero({ trip, height, scrollY }: { trip: Trip; height: number; scrollY: Animated.Value }) {
  const reduced = useReducedMotion();
  const range = [0, height * 0.75];
  const scale = scrollY.interpolate({ inputRange: range, outputRange: [1.03, 1.12], extrapolate: 'clamp' });
  const blur = scrollY.interpolate({ inputRange: range, outputRange: [0, 9], extrapolate: 'clamp' });
  const opacity = scrollY.interpolate({ inputRange: [0, height * 0.4], outputRange: [1, 0], extrapolate: 'clamp' });
  return <View pointerEvents="none" testID="trip-hero" style={[styles.hero, { height }]}>
    <View testID="trip-hero-art" style={StyleSheet.absoluteFill}>
    {trip.coverImage
      ? <Animated.Image testID="trip-hero-photo" source={{ uri: trip.coverImage }} resizeMode="cover" blurRadius={reduced ? 0 : blur} style={[StyleSheet.absoluteFill, { transform: [{ scale: reduced ? 1 : scale }] }]} />
      : <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ scale: reduced ? 1 : scale }] }]}><TripCover fill /></Animated.View>}
    <View testID="trip-hero-shade" style={[StyleSheet.absoluteFill, styles.shade]} />
    </View>
    <Animated.View style={[styles.caption, { opacity }]}>
      <Text style={styles.eyebrow}>TABI / TRAVEL JOURNAL</Text>
      <Text numberOfLines={2} style={styles.destination}>{trip.destination || trip.name}</Text>
      <View style={styles.captionBottom}><Text style={styles.dates}>{trip.startsOn.replaceAll('-', '.')} — {trip.endsOn.replaceAll('-', '.')}</Text><Text style={styles.arrow}>↓</Text></View>
    </Animated.View>
  </View>;
}

const styles = StyleSheet.create({
  hero: { position: 'absolute', top: 0, left: 0, right: 0, overflow: 'hidden', backgroundColor: '#557984' },
  shade: { backgroundColor: 'rgba(13,32,43,0.28)' },
  caption: { position: 'absolute', bottom: 54, width: '100%', maxWidth: 800, alignSelf: 'center', paddingHorizontal: 28, gap: 10 },
  eyebrow: { color: '#FFFFFFCC', fontSize: 10, fontWeight: '600', letterSpacing: 3 },
  destination: { color: '#FFFFFF', fontSize: 28, lineHeight: 36, fontWeight: '800', letterSpacing: -0.7 },
  captionBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dates: { color: '#FFFFFFDD', fontSize: 11, letterSpacing: 1 },
  arrow: { color: '#FFFFFF', fontSize: 22 },
});
