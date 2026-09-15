import { Platform } from 'react-native';
import { TripTransitions } from '@/components/trip-transitions';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { AppThemeProvider, useAppTheme } from '@/theme/theme-provider';
import '@/global.css';
import '@/motion.css';
import '@/redesign.css';
import { WebWorkspace } from '@/components/web-workspace';
import { ToastProvider } from '@/components/toast';
import { PwaSetup } from '@/components/pwa';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { AuthGate } from '@/auth/auth-gate';
import { AuthProvider, useAuth } from '@/auth/auth-provider';
import { TravelProvider } from '@/data/travel-provider';

export default function RootLayout() {
  return <AppThemeProvider><AppFrame /></AppThemeProvider>;
}

function AppFrame() {
  const { scheme, palette } = useAppTheme();
  const navigationTheme = scheme === 'dark' ? DarkTheme : DefaultTheme;
  return (
    <ThemeProvider value={{ ...navigationTheme, colors: { ...navigationTheme.colors, background: palette.canvas, card: palette.paper, text: palette.ink, border: palette.ash, primary: palette.ocean } }}>
      <PwaSetup />
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <ToastProvider><AuthProvider>
        <AuthGate>
          <TravelRoot />
        </AuthGate>
      </AuthProvider></ToastProvider>
    </ThemeProvider>
  );
}

function TravelRoot() {
  const reduced = useReducedMotion();
  const { palette } = useAppTheme();
  const { isDemo, user } = useAuth();
  return <TravelProvider key={isDemo ? 'demo' : user?.id}>
            <TripTransitions /><WebWorkspace><Stack screenOptions={{ contentStyle: { backgroundColor: palette.canvas }, headerShown: false }}>
              <Stack.Screen name="index" />
              <Stack.Screen name="settings" />
              <Stack.Screen name="trips/[tripId]" options={{ animation: Platform.OS === 'web' || reduced ? 'none' : 'slide_from_right' }} />
            </Stack></WebWorkspace>
          </TravelProvider>;
}
