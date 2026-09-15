import type { PropsWithChildren } from 'react';
import type { PlanSource } from '@/data/planner';
import type { PlacementSlot } from '@/data/itinerary-placement';
export type PlannerDragProps = PropsWithChildren<{
  enabled: boolean; source: PlanSource | null;
  onSelect: (source: PlanSource | null) => void;
  onDrop: (source: PlanSource, slot: PlacementSlot) => void;
  onDay: (day: string) => void;
}>;
export type PlannerHandleProps = { source: PlanSource; label: string; disabled?: boolean };
export type PlannerSlotProps = { slot: PlacementSlot; label: string; disabled?: boolean };
