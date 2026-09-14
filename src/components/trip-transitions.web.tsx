import { usePathname } from 'expo-router';
import { useEffect, useLayoutEffect } from 'react';
import { installTripTransitions, tripRouteDidRender } from '@/utils/trip-transition.web';
import '@/trip-transitions.css';

export function TripTransitions() {
  const pathname = usePathname();
  useLayoutEffect(() => { tripRouteDidRender(pathname); }, [pathname]);
  useEffect(installTripTransitions, []);
  return null;
}
