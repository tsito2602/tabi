import { PropsWithChildren } from 'react';
import { View } from 'react-native';
export function MotionPage({ children }: PropsWithChildren) { return <View testID="route-transition" style={{ flex: 1 }}>{children}</View>; }
