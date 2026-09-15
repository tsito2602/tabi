import { createContext, useContext, type PropsWithChildren } from 'react';
import { Pressable, Text, View } from 'react-native';
import { usePalette } from '@/theme/theme-provider';
import type { PlannerDragProps, PlannerHandleProps, PlannerSlotProps } from './planner-drag.types';

// The native fallback keeps the same selection/placement commands without
// importing DOM APIs. Mobile Web/PWA uses the pointer implementation.
const Context = createContext<PlannerDragProps | null>(null);
export function PlannerDrag({ children, ...props }: PlannerDragProps) {
  return <Context.Provider value={props}><View style={{ flex: 1, minHeight: 0 }}>{children}</View></Context.Provider>;
}
export function PlannerHandle({ source, label, disabled }: PlannerHandleProps) {
  const c = useContext(Context), p = usePalette();
  if (!c?.enabled) return null;
  return <Pressable disabled={disabled} accessibilityRole="button" accessibilityLabel={`${label}を移動・配置する`}
    onPress={() => c.onSelect(source)} style={{ minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'center' }}><Text style={{ color: p.smoke, fontSize: 24 }}>⠿</Text></Pressable>;
}
export function PlannerSlot({ slot, label, disabled }: PlannerSlotProps) {
  const c = useContext(Context), p = usePalette();
  if (!c?.enabled || !c.source) return null;
  return <Pressable disabled={disabled} accessibilityRole="button" accessibilityLabel={label}
    onPress={() => { if (c.source) c.onDrop(c.source, slot); }} style={{ minHeight: 44, justifyContent: 'center', alignItems: 'center', opacity: disabled ? 0.3 : 1 }}><Text style={{ color: p.ocean }}>ここに配置</Text></Pressable>;
}
export function PlannerCard({ children }: PropsWithChildren) { return <View style={{ flex: 1, minWidth: 0 }}>{children}</View>; }
export function PlannerEntry({ children }: PropsWithChildren<{ entryKey: string }>) { return <View>{children}</View>; }
export function PlannerDay({ children }: PropsWithChildren<{ day: string }>) { return <View>{children}</View>; }
