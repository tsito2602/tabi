import { DefaultTheme, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import AppTabs from '@/components/app-tabs';
import { Palette } from '@/constants/theme';

const tabiTheme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: Palette.paper, card: Palette.white, text: Palette.ink, primary: Palette.coral },
};

export default function TabLayout() {
  return (
    <ThemeProvider value={tabiTheme}>
      <StatusBar style="dark" />
      <AppTabs />
    </ThemeProvider>
  );
}
