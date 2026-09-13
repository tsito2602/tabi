import type { PropsWithChildren, ReactNode } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Palette } from '@/constants/theme';

type Props = PropsWithChildren<{
  kicker?: string;
  title: string;
  action?: ReactNode;
  afterHeader?: ReactNode;
}>;

export function ScreenShell({ kicker, title, action, afterHeader, children }: Props) {
  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView contentContainerStyle={styles.outer} showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          <View style={styles.header}>
            <View style={styles.heading}>
              {kicker ? <Text style={styles.kicker}>{kicker}</Text> : null}
              <Text style={styles.title}>{title}</Text>
            </View>
            {action}
          </View>
          {afterHeader}
          {children}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Palette.paper },
  outer: { paddingBottom: 124 },
  content: { width: '100%', maxWidth: 920, alignSelf: 'center', paddingHorizontal: 20, paddingTop: Platform.select({ web: 94, default: 12 }), gap: 18 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 },
  heading: { flex: 1 },
  kicker: { color: Palette.coralDark, fontSize: 13, lineHeight: 18, fontWeight: '800', letterSpacing: 0.3, marginBottom: 4 },
  title: { color: Palette.ink, fontSize: 34, lineHeight: 41, fontWeight: '900', letterSpacing: -1.1 },
});
