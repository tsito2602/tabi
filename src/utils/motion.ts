import { Platform } from 'react-native';

// Read the same tokens as CSS; native uses the documented token defaults.
export function motionMs(token: string, fallback: number) {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  const number = parseFloat(value);
  return Number.isFinite(number) ? number * (value.endsWith('ms') ? 1 : 1000) : fallback;
}
