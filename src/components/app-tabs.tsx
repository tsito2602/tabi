import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { Palette } from '@/constants/theme';

export default function AppTabs() {
  return (
    <NativeTabs backgroundColor={Palette.white} indicatorColor={Palette.skySoft} tintColor={Palette.coral} iconColor={{ default: '#77817D', selected: Palette.coralDark }} labelStyle={{ default: { color: '#77817D' }, selected: { color: Palette.coralDark, fontWeight: '700' } }}>
      <NativeTabs.Trigger name="index"><NativeTabs.Trigger.Label>旅</NativeTabs.Trigger.Label><NativeTabs.Trigger.Icon sf={{ default: 'map', selected: 'map.fill' }} md="map" /></NativeTabs.Trigger>
      <NativeTabs.Trigger name="itinerary"><NativeTabs.Trigger.Label>日程</NativeTabs.Trigger.Label><NativeTabs.Trigger.Icon sf={{ default: 'calendar', selected: 'calendar.circle.fill' }} md="route" /></NativeTabs.Trigger>
      <NativeTabs.Trigger name="bookings"><NativeTabs.Trigger.Label>ポケット</NativeTabs.Trigger.Label><NativeTabs.Trigger.Icon sf={{ default: 'wallet.pass', selected: 'wallet.pass.fill' }} md="confirmation_number" /></NativeTabs.Trigger>
      <NativeTabs.Trigger name="packing"><NativeTabs.Trigger.Label>持ち物</NativeTabs.Trigger.Label><NativeTabs.Trigger.Icon sf={{ default: 'checklist', selected: 'checklist.checked' }} md="checklist" /></NativeTabs.Trigger>
    </NativeTabs>
  );
}
