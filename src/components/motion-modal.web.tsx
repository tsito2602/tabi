import { useCallback, useContext, useLayoutEffect, useRef, useState } from 'react';
import { Modal, ModalProps } from 'react-native';
import { MotionExitContext, MotionPresenceContext } from './motion-presence.web';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { motionMs } from '@/utils/motion';
import { waitForMotion } from '@/utils/web-motion';

const surfaceSelector = '[data-testid="form-sheet"], [data-testid="picker-sheet"], [data-testid="delete-trip-dialog"], [data-testid="trip-menu"], [data-testid="discard-dialog"]';
const viewportSelector = '[data-testid="form-modal-viewport"], [data-testid="detail-modal-viewport"], [data-testid="modal-viewport"]';

export function MotionModal({ children, visible = true, motion = 'modal', onRequestClose, ...props }: ModalProps & { motion?: 'modal' | 'dropdown' }) {
  const present = useContext(MotionPresenceContext);
  const exits = useContext(MotionExitContext);
  const open = visible && present;
  const reduced = useReducedMotion();
  const [mounted, setMounted] = useState(open);
  const [snapshot, setSnapshot] = useState({ open, children });
  if (snapshot.open !== open || (open && snapshot.children !== children)) {
    setSnapshot({ open, children: open ? children : snapshot.children });
    if (open) setMounted(true);
  }
  // Modal creates a portal asynchronously. A stateful ref observes its real DOM
  // arrival, rather than starting an exit clock before the surface exists.
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const release = useRef<(() => void) | undefined>(undefined);
  const releaseExit = useCallback(() => {
    const complete = release.current;
    release.current = undefined;
    complete?.();
  }, []);
  useLayoutEffect(() => {
    if (open && !release.current) release.current = exits?.register();
  }, [open, exits]);
  useLayoutEffect(() => () => releaseExit(), [releaseExit]);
  useLayoutEffect(() => {
    const finish = () => { setMounted(false); releaseExit(); };
    const surface = root?.querySelector<HTMLElement>(surfaceSelector);
    if (!root || !surface) {
      if (!open) finish();
      return;
    }
    const viewport = surface.closest<HTMLElement>(viewportSelector) ?? root;
    if (!viewport.classList.contains('motion-viewport')) {
      viewport.style.setProperty('--motion-backdrop-color', getComputedStyle(viewport).backgroundColor);
      viewport.classList.add('motion-viewport');
    }
    const sheet = surface.matches('[data-testid="form-sheet"], [data-testid="picker-sheet"]');
    root.setAttribute('data-presentation', motion === 'dropdown' ? 'dropdown' : sheet ? viewport.dataset.testid === 'detail-modal-viewport' ? 'detail' : 'sheet' : 'dialog');
    surface.dataset.motionSurface = '';
    surface.classList.add(`t-${motion}`);
    if (motion === 'dropdown') surface.dataset.origin = 'top-right';
    // One style flush establishes the initial pose; later updates reverse the
    // existing transition instead of replacing it with a fresh animation.
    void surface.offsetWidth;
    surface.classList.toggle('is-open', open);
    surface.classList.toggle('is-closing', !open);
    root.classList.toggle('is-open', open);
    surface.inert = !open;
    if (open) return;
    if (reduced) {
      finish();
      return;
    }
    return waitForMotion([surface, viewport], finish, motionMs(`--${motion}-close-dur`, 150));
  }, [root, open, motion, reduced, releaseExit]);
  return <Modal {...props} visible={open || mounted} animationType="none" onRequestClose={open ? onRequestClose : undefined}>
    <div ref={setRoot} className="motion-overlay" inert={!open} aria-hidden={!open} style={{ display: 'flex', flex: 1, minHeight: 0 }}>
      {open ? children : snapshot.children}
    </div>
  </Modal>;
}
