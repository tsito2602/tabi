import { useTravel } from '@/data/travel-provider';
import { useThemedStyles } from '@/theme/theme-provider';
import {
  Tabs,
  TabList,
  TabTrigger,
  TabSlot,
  TabTriggerSlotProps,
  TabListProps,
} from 'expo-router/ui';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { type Palette } from '@/constants/design';

type TabButtonProps = TabTriggerSlotProps & {
  icon: string;
};

export default function AppTabs() {
  const { selectedTrip } = useTravel();
  const styles = useThemedStyles(createStyles);

  return (
    <Tabs>
      <TabSlot style={styles.slot} />
      <TabList asChild>
        <BottomTabList>
          <TabTrigger name="home" href="/" asChild>
            <TabButton icon="⌂">旅</TabButton>
          </TabTrigger>
          <TabTrigger name="itinerary" href={selectedTrip ? { pathname: '/trips/[tripId]/itinerary', params: { tripId: selectedTrip.id } } : '/'} asChild>
            <TabButton icon="≡">日程</TabButton>
          </TabTrigger>
          <TabTrigger name="packing" href={selectedTrip ? { pathname: '/trips/[tripId]/packing', params: { tripId: selectedTrip.id } } : '/'} asChild>
            <TabButton icon="✓">準備</TabButton>
          </TabTrigger>
          <TabTrigger name="bookings" href={selectedTrip ? { pathname: '/trips/[tripId]/bookings', params: { tripId: selectedTrip.id } } : '/'} asChild>
            <TabButton icon="⌁">予約</TabButton>
          </TabTrigger>
        </BottomTabList>
      </TabList>
    </Tabs>
  );
}

function TabButton({ children, icon, isFocused, ...props }: TabButtonProps) {
  const styles = useThemedStyles(createStyles);

  return (
    <Pressable
      {...props}
      style={({ pressed }) => [styles.tabButton, pressed && styles.pressed]}>
      <View style={[styles.iconWrap, isFocused && styles.iconWrapSelected]}>
        <Text style={[styles.icon, isFocused && styles.selectedText]}>{icon}</Text>
      </View>
      <Text style={[styles.label, isFocused && styles.selectedText]}>{children}</Text>
    </Pressable>
  );
}

function BottomTabList(props: TabListProps) {
  const styles = useThemedStyles(createStyles);

  return (
    <View {...props} style={styles.tabListContainer}>
      <View style={styles.innerContainer}>{props.children}</View>
    </View>
  );
}

const createStyles = (palette: Palette) => StyleSheet.create({
  slot: {
    flex: 1,
  },
  tabListContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 14,
    zIndex: 100,
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  innerContainer: {
    width: '100%',
    maxWidth: 520,
    minHeight: 70,
    paddingHorizontal: 8,
    paddingVertical: 7,
    borderRadius: 48,
    backgroundColor: palette.paper,
    flexDirection: 'row',
    alignItems: 'center',
  },
  tabButton: {
    flex: 1,
    minWidth: 64,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    borderRadius: 32,
    paddingVertical: 3,
  },
  iconWrap: {
    minWidth: 32,
    height: 27,
    paddingHorizontal: 8,
    borderRadius: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapSelected: {
    backgroundColor: palette.sky,
  },
  icon: {
    color: palette.smoke,
    fontSize: 18,
    lineHeight: 20,
    fontWeight: '700',
  },
  label: {
    color: palette.slate,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '500',
  },
  selectedText: {
    color: palette.ink,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.62,
  },
});
