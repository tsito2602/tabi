import { MotionPage } from '@/components/motion-page';
import { usePalette, useThemedStyles } from '@/theme/theme-provider';
import { PageActionContext, type PageAction } from '@/components/page-action-context';
import { useDesktop } from '@/hooks/use-desktop';
import { Redirect, Slot, useLocalSearchParams, usePathname } from 'expo-router';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { TripHeaderHeight } from '@/components/trip-header-context';
import { TripHero, TripHeroContext } from '@/components/trip-hero';
import { TripTopTabs } from '@/components/trip-top-tabs';
import { type Palette } from '@/constants/design';
import { useTravel } from '@/data/travel-provider';

export default function TripLayout() {
  const palette = usePalette();
  const styles = useThemedStyles(createStyles);

  const desktop = useDesktop();
  const [action, setAction] = useState<PageAction | null>(null);
  const insets = useSafeAreaInsets();
  const headerRef = useRef<View>(null);
  const [headerHeight, setHeaderHeight] = useState(160);
  const pathname = usePathname();
  const { height: windowHeight } = useWindowDimensions();
  const [scrollY] = useState(() => new Animated.Value(0));
  const [pinAt, setPinAt] = useState(200);
  const showHero = !desktop && pathname.endsWith('/itinerary');
  const heroHeight = Math.max(headerHeight + insets.top + 170, Math.min(430, windowHeight * 0.48));
  useEffect(() => { scrollY.setValue(0); }, [pathname, scrollY]);
  const { tripId: rawTripId } = useLocalSearchParams<{ tripId: string | string[] }>();
  const tripId = Array.isArray(rawTripId) ? rawTripId[0] : rawTripId;
  const { ready, trips, selectedTrip, selectTrip } = useTravel();
  const tripExists = trips.some((trip) => trip.id === tripId);

  useEffect(() => {
    if (ready && tripExists && selectedTrip?.id !== tripId) selectTrip(tripId);
  }, [ready, selectTrip, selectedTrip?.id, tripExists, tripId]);

  // Measure the initial web header during commit, not after the snapshot.
  useLayoutEffect(() => {
    const element = headerRef.current as unknown as { getBoundingClientRect?: () => { height: number } } | null;
    if (Platform.OS === 'web' && element?.getBoundingClientRect) {
      setHeaderHeight(Math.max(0, element.getBoundingClientRect().height - insets.top));
    }
  }, [desktop, insets.top, ready, selectedTrip?.id, tripId]);

  if (!ready || (tripExists && selectedTrip?.id !== tripId)) {
    return <View style={styles.loading}><ActivityIndicator color={palette.ocean} /></View>;
  }
  if (!tripId || !tripExists) return <Redirect href="/" />;

  return (
    <PageActionContext.Provider value={{ action, setAction }}><View nativeID={`trip-workspace-${encodeURIComponent(tripId)}`} testID="trip-workspace" style={styles.safeArea}>
      {showHero && selectedTrip ? <TripHero trip={selectedTrip} height={heroHeight} scrollY={scrollY} /> : null}
      {showHero ? <Animated.View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: headerHeight + insets.top, backgroundColor: palette.canvas, opacity: scrollY.interpolate({ inputRange: [Math.max(0, pinAt - 100), Math.max(1, pinAt)], outputRange: [0, 1], extrapolate: 'clamp' }) }} /> : null}
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <TripHeroContext.Provider value={{ height: desktop ? headerHeight + 28 : heroHeight - insets.top, scrollY, setPinAt }}>
          <TripHeaderHeight.Provider value={headerHeight}>
            {/* Page offsets exclude the top inset already supplied by SafeAreaView. */}
            <View ref={headerRef} style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 30 }} onLayout={(event) => setHeaderHeight(Math.max(0, event.nativeEvent.layout.height - insets.top))}><TripTopTabs tripId={tripId} /></View>
            <MotionPage key={pathname}><Slot /></MotionPage>
          </TripHeaderHeight.Provider>
        </TripHeroContext.Provider>
      </SafeAreaView>
    </View></PageActionContext.Provider>
  );
}

const createStyles = (palette: Palette) => StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: palette.canvas },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.canvas },
});
