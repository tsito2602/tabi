import { usePalette, useThemedStyles } from '@/theme/theme-provider';
import { PropsWithChildren } from 'react';
import { BrandLogo } from '@/components/brand-logo';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { type Palette } from '@/constants/design';

import { useAuth } from './auth-provider';

export function AuthGate({ children }: PropsWithChildren) {
  const palette = usePalette();
  const styles = useThemedStyles(createStyles);

  const { configured, demoEnabled, error, loading, signingIn, signIn, user, isDemo, startDemo } = useAuth();
  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator color={palette.ocean} size="large" />
      </SafeAreaView>
    );
  }
  if (user || isDemo) return children;
  return (
    <SafeAreaView style={styles.safeArea}>
      <View testID="login-content" style={styles.content}>
        <BrandLogo style={styles.logo} contentFit="contain" accessible={false} />
        <Text accessibilityRole="header" style={styles.wordmark}>tabi</Text>
        <Text style={styles.body}>しおり、予約、旅の準備をひとつに。</Text>
        <Pressable
          accessibilityRole="button"
          disabled={signingIn || !configured}
          onPress={() => void signIn()}
          style={({ pressed }) => [styles.button, pressed && styles.pressed, (signingIn || !configured) && styles.disabled]}>
          {signingIn ? <ActivityIndicator color={palette.paper} /> : <Text style={styles.buttonText}>Googleで続ける</Text>}
        </Pressable>
        {demoEnabled && <Pressable accessibilityRole="button" onPress={startDemo} style={styles.sampleButton}><Text style={styles.sampleText}>サンプルの旅行で試す</Text></Pressable>}
        {!configured && demoEnabled && <Text style={styles.note}>このプレビューではサンプルの旅行を利用できます</Text>}
        {error && <Text style={styles.error}>{error}</Text>}
      </View>
    </SafeAreaView>
  );
}

const createStyles = (palette: Palette) => StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: palette.canvas },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.canvas },
  content: { width: '100%', maxWidth: 720, alignSelf: 'center', flex: 1, justifyContent: 'center', padding: 28 },
  logo: { width: 200, height: 200, alignSelf: 'center' },
  wordmark: { alignSelf: 'center', color: palette.ink, fontSize: 48, lineHeight: 56, fontWeight: '800', letterSpacing: -1.5, marginTop: -20 },
  sampleButton: { minHeight: 56, justifyContent: 'center', alignItems: 'center', marginTop: 12, backgroundColor: palette.paper, borderRadius: 8 },
  sampleText: { color: palette.ocean, fontSize: 15, fontWeight: '700' },
  body: { maxWidth: 460, alignSelf: 'center', textAlign: 'center', color: palette.slate, fontSize: 16, lineHeight: 24, marginTop: 16, marginBottom: 40 },
  button: { minHeight: 56, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.ocean },
  buttonText: { color: palette.onOcean, fontSize: 16, fontWeight: '700' },
  pressed: { opacity: 0.82, transform: [{ scale: 0.99 }] },
  disabled: { opacity: 0.65 },
  note: { color: palette.slate, fontSize: 12, textAlign: 'center', marginTop: 14 },
  error: { color: palette.danger, fontSize: 13, textAlign: 'center', marginTop: 14 },
});
