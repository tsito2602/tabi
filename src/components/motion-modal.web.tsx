import { useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Modal, ModalProps } from 'react-native';
import { MotionPresenceContext } from './motion-presence.web';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { motionMs } from '@/utils/motion';

const surfaceSelector = '[data-testid="form-sheet"], [data-testid="picker-sheet"], [data-testid="delete-trip-dialog"], [data-testid="trip-menu"], [data-testid="discard-dialog"]';

export function MotionModal({ children, visible = true, motion = 'modal', ...props }: ModalProps & { motion?: 'modal' | 'dropdown' }) {
  const present = useContext(MotionPresenceContext);
  const open = visible && present;
  const reduced = useReducedMotion();
  const [mounted, setMounted] = useState(open);
  const [snapshot, setSnapshot] = useState({ open, children });
  if (snapshot.open !== open || (open && snapshot.children !== children)) {
    setSnapshot({ open, children: open ? children : snapshot.children });
    if (open) setMounted(true);
  }
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) return;
    const timer = setTimeout(() => setMounted(false), reduced ? 0 : motionMs(`--${motion}-close-dur`, 150));
    return () => clearTimeout(timer);
  }, [open, motion, reduced]);
  const applyState = useCallback((element: HTMLDivElement | null) => {
    root.current = element;
    const surface = element?.querySelector<HTMLElement>(surfaceSelector);
    if (!surface || !element) return;
    surface.classList.add(`t-${motion}`);
    if (motion === 'dropdown') surface.dataset.origin = 'top-right';
    // Establish the resting scale before the first open. Subsequent state
    // changes reverse the current transition, even during a rapid reopen.
    void surface.offsetWidth;
    surface.classList.toggle('is-open', open);
    surface.classList.toggle('is-closing', !open);
    element.classList.toggle('is-open', open);
    surface.inert = !open;
  }, [motion, open]);
  useLayoutEffect(() => { applyState(root.current); });
  return <Modal {...props} visible={open || mounted} animationType="none">
    <div ref={applyState} className="motion-overlay" inert={!open} style={{ display: 'flex', flex: 1, minHeight: 0 }}>
      {open ? children : snapshot.children}
    </div>
  </Modal>;
}
