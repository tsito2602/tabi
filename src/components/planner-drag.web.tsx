import { createContext, useContext, useLayoutEffect, useRef, type PropsWithChildren } from 'react';
import { plannerSourceKey } from '@/data/planner';
import { attachPlannerPointer } from '@/utils/planner-pointer.web';
import type { PlannerDragProps, PlannerHandleProps, PlannerSlotProps } from './planner-drag.types';

const Context = createContext<PlannerDragProps | null>(null);
export function PlannerDrag({ children, ...props }: PlannerDragProps) {
  const root = useRef<HTMLDivElement>(null);
  const live = useRef(props);
  // Native pointer callbacks must only observe committed props.
  useLayoutEffect(() => { live.current = props; });
  useLayoutEffect(() => {
    if (!root.current || !props.enabled) return;
    return attachPlannerPointer(root.current, {
      start: source => live.current.onSelect(source), drop: (source, slot) => live.current.onDrop(source, slot),
      day: day => live.current.onDay(day), cancel: () => live.current.onSelect(null),
    });
  }, [props.enabled]);
  return <Context.Provider value={props}><div ref={root} className="planner-root" data-plan-enabled={props.enabled || undefined}
    data-plan-selected={Boolean(props.source) || undefined}
    onKeyDown={e => { if (e.key === 'Escape' && props.source) { e.preventDefault(); props.onSelect(null); } }}>{children}</div></Context.Provider>;
}
export function PlannerHandle({ source, label, disabled }: PlannerHandleProps) {
  const context = useContext(Context);
  if (!context?.enabled) return null;
  const selected = Boolean(context.source && plannerSourceKey(context.source) === plannerSourceKey(source));
  return <button type="button" className="planner-handle" data-plan-source={JSON.stringify(source)} disabled={disabled}
    aria-label={`${label}を移動・配置する`} aria-pressed={selected}
    onClick={e => {
      e.stopPropagation(); context.onSelect(selected ? null : source);
      if (e.detail === 0 && !selected) {
        const root = e.currentTarget.closest('.planner-root');
        requestAnimationFrame(() => {
          if (!root || root.closest('[inert], [aria-hidden="true"]')) return;
          const slots = [...root.querySelectorAll<HTMLButtonElement>('[data-plan-drop]:not([disabled])')];
          const visible = slots.find(slot => { const r = slot.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; });
          (visible ?? slots[0])?.focus({ preventScroll: Boolean(visible) });
        });
      }
    }}>⠿</button>;
}
export function PlannerSlot({ slot, label, disabled }: PlannerSlotProps) {
  const context = useContext(Context);
  if (!context?.enabled) return null;
  return <button type="button" className="planner-slot" data-plan-drop={JSON.stringify(slot)} data-plan-before={slot.beforeKey ?? ''} data-plan-after={slot.afterKey ?? ''}
    disabled={disabled} aria-label={label} tabIndex={context.source && !disabled ? 0 : -1}
    onClick={() => { if (context.source && !disabled) context.onDrop(context.source, slot); }}><span>{context.source ? 'ここに配置' : ''}</span></button>;
}
export function PlannerCard({ children }: PropsWithChildren) { return <div className="planner-card-frame" data-plan-card>{children}</div>; }
export function PlannerEntry({ children, entryKey }: PropsWithChildren<{ entryKey: string }>) { return <div data-plan-entry={entryKey}>{children}</div>; }
export function PlannerDay({ children, day }: PropsWithChildren<{ day: string }>) { return <div data-plan-day={day} className="planner-day">{children}</div>; }
