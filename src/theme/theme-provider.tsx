import * as SystemUI from 'expo-system-ui';
import { createContext, type PropsWithChildren, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Appearance, Platform, useColorScheme } from 'react-native';
import { darkPalette, lightPalette, type Palette } from '@/constants/design';
import { normalizeThemePreference, resolveTheme, THEME_KEY, type ThemePreference } from './preferences';
import { readTheme, writeTheme } from './storage';
import { installWebUiOverrides } from './web-ui-overrides';

type ThemeValue = { preference: ThemePreference; scheme: 'light' | 'dark'; palette: Palette; setPreference: (preference: ThemePreference) => void; storageError: string };
const ThemeContext = createContext<ThemeValue>({ preference: 'system', scheme: 'light', palette: lightPalette, setPreference: () => undefined, storageError: '' });

export function AppThemeProvider({ children }: PropsWithChildren) {
  const systemScheme = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState('');
  const touched = useRef(false);
  const writes = useRef(Promise.resolve());
  const scheme = resolveTheme(preference, systemScheme);
  const palette = scheme === 'dark' ? darkPalette : lightPalette;
  useEffect(() => installWebUiOverrides(), []);
  useEffect(() => {
    let active = true;
    void readTheme().then((value) => { if (active && !touched.current) setPreferenceState(normalizeThemePreference(value)); }).catch(() => undefined).finally(() => { if (active) setReady(true); });
    if (Platform.OS !== 'web') return () => { active = false; };
    const receive = (event: StorageEvent) => { if (event.key === THEME_KEY || event.key === null) { touched.current = true; setPreferenceState(normalizeThemePreference(event.newValue)); } };
    window.addEventListener('storage', receive);
    return () => { active = false; window.removeEventListener('storage', receive); };
  }, []);
  useEffect(() => {
    if (!ready) return;
    if (Platform.OS === 'web') {
      document.documentElement.dataset.theme = scheme;
      document.documentElement.style.colorScheme = scheme;
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', palette.canvas);
    } else {
      Appearance.setColorScheme(preference === 'system' ? 'unspecified' : preference);
      void SystemUI.setBackgroundColorAsync(palette.canvas).catch(() => undefined);
    }
  }, [palette.canvas, preference, ready, scheme]);
  const setPreference = useCallback((value: ThemePreference) => {
    touched.current = true;
    setPreferenceState(value);
    setStorageError('');
    writes.current = writes.current.catch(() => undefined).then(() => writeTheme(value)).catch(() => { setStorageError('この端末に設定を保存できませんでした'); });
  }, []);
  const value = useMemo(() => ({ preference, scheme, palette, setPreference, storageError }), [preference, scheme, palette, setPreference, storageError]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
export const useAppTheme = () => useContext(ThemeContext);
export const usePalette = () => useAppTheme().palette;
export function useThemedStyles<T>(create: (palette: Palette) => T): T {
  const palette = usePalette();
  return useMemo(() => create(palette), [create, palette]);
}
