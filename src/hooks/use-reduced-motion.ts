import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

export function useReducedMotion() {
  const [reduced, setReduced] = useState(() => Platform.OS === 'web' && typeof matchMedia !== 'undefined' ? matchMedia('(prefers-reduced-motion: reduce)').matches : false);
  useEffect(() => {
    if (Platform.OS === 'web') {
      const media = matchMedia('(prefers-reduced-motion: reduce)');
      const update = () => setReduced(media.matches);
      update();
      media.addEventListener('change', update);
      return () => media.removeEventListener('change', update);
    }
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => { if (active) setReduced(value); });
    const listener = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => { active = false; listener.remove(); };
  }, []);
  return reduced;
}
