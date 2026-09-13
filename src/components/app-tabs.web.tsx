import { TabList, TabSlot, TabTrigger, Tabs, type TabListProps, type TabTriggerSlotProps } from 'expo-router/ui';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { MaxContentWidth, Palette } from '@/constants/theme';

export default function AppTabs() {
  return (
    <Tabs>
      <TabSlot style={styles.slot} />
      <TabList asChild>
        <CustomTabList>
          <TabTrigger name="home" href="/" asChild><TabButton>旅</TabButton></TabTrigger>
          <TabTrigger name="itinerary" href="/itinerary" asChild><TabButton>日程</TabButton></TabTrigger>
          <TabTrigger name="bookings" href="/bookings" asChild><TabButton>ポケット</TabButton></TabTrigger>
          <TabTrigger name="packing" href="/packing" asChild><TabButton>持ち物</TabButton></TabTrigger>
        </CustomTabList>
      </TabList>
    </Tabs>
  );
}

function TabButton({ children, isFocused, ...props }: TabTriggerSlotProps) {
  const label = typeof children === 'string' ? children : '';
  return <Pressable {...props} style={({ pressed }) => [styles.tabButton, isFocused && styles.tabButtonActive, pressed && styles.pressed]}><View style={[styles.tabDot, isFocused && styles.tabDotActive]} /><Text style={[styles.tabText, isFocused && styles.tabTextActive]}>{label}</Text></Pressable>;
}

function CustomTabList(props: TabListProps) {
  return <View {...props} style={styles.tabListContainer}><View style={styles.inner}><View style={styles.brand}><Text style={styles.brandMark}>t</Text><Text style={styles.brandText}>tabi</Text></View><View style={styles.links}>{props.children}</View></View></View>;
}

const styles = StyleSheet.create({
  slot: { height: '100%' },
  tabListContainer: { position: 'absolute', width: '100%', top: 0, paddingHorizontal: 20, paddingTop: 14, alignItems: 'center' },
  inner: { width: '100%', maxWidth: MaxContentWidth, minHeight: 60, borderRadius: 22, backgroundColor: 'rgba(255,254,250,0.96)', paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', shadowColor: Palette.ink, shadowOpacity: 0.1, shadowRadius: 20, shadowOffset: { width: 0, height: 8 } },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8, marginRight: 'auto', paddingLeft: 4 },
  brandMark: { width: 30, height: 30, borderRadius: 10, overflow: 'hidden', backgroundColor: Palette.coral, color: Palette.white, textAlign: 'center', fontSize: 20, lineHeight: 29, fontWeight: '900' },
  brandText: { color: Palette.ink, fontSize: 17, fontWeight: '900', letterSpacing: -0.5 },
  links: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  tabButton: { minHeight: 40, borderRadius: 14, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 7 },
  tabButtonActive: { backgroundColor: Palette.ink },
  tabDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Palette.line },
  tabDotActive: { backgroundColor: Palette.sun },
  tabText: { color: Palette.muted, fontSize: 13, fontWeight: '800' },
  tabTextActive: { color: Palette.white },
  pressed: { opacity: 0.65 },
});
