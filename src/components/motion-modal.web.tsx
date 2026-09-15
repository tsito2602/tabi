import type { DetailOrigin } from '@/utils/detail-origin';
import '@/detail-motion.css';
import { createDetailMotion } from '@/utils/detail-motion.web';
import { trackModalViewportInsets } from '@/utils/modal-viewport-insets.web';
import { useCallback, useContext, useLayoutEffect, useRef, useState } from 'react';
import { Modal, ModalProps } from 'react-native';
import { MotionExitContext, MotionPresenceContext } from './motion-presence.web';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { motionMs } from '@/utils/motion';
import { waitForMotion } from '@/utils/web-motion';

const surfaceSelector = '[data-testid="form-sheet"], [data-testid="picker-sheet"], [data-testid="note-editor"], [data-testid="delete-trip-dialog"], [data-testid="trip-menu"], [data-testid="discard-dialog"]';
const viewportSelector = '[data-testid="form-modal-viewport"], [data-testid="detail-modal-viewport"], [data-testid="modal-viewport"], [data-testid="note-modal-viewport"]';

export function MotionModal({ children, visible = true, motion = 'modal', onRequestClose, detail = false, detailOrigin, onDetailDismiss, ...props }: ModalProps & { motion?: 'modal' | 'dropdown'; detail?: boolean; detailOrigin?: DetailOrigin; onDetailDismiss?: () => void }) {
  const present = useContext(MotionPresenceContext);
  const exits = useContext(MotionExitContext);
  const open = visible && present;
  const reduced = useReducedMotion();
  const [mounted, setMounted] = useState(open);
  const [snapshot, setSnapshot] = useState({ open, children, detail, detailOrigin });
  if (snapshot.open !== open || (open && (snapshot.children !== children || snapshot.detail !== detail || snapshot.detailOrigin !== detailOrigin))) {
    setSnapshot(open ? { open, children, detail, detailOrigin } : { ...snapshot, open });
    if (open) setMounted(true);
  }
  // Clearing the selected item can change presentation and origin in the same
  // render as visible=false. Retain them with the outgoing DOM until it exits.
  const presentedDetail = open ? detail : snapshot.detail;
  const presentedOrigin = open ? detailOrigin : snapshot.detailOrigin;
  // Modal creates a portal asynchronously. A stateful ref observes its real DOM
  // arrival, rather than starting an exit clock before the surface exists.
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const detailMotion = useRef<ReturnType<typeof createDetailMotion> | null>(null);
  const dismiss = useRef(onDetailDismiss);
  useLayoutEffect(() => { dismiss.current = onDetailDismiss; }, [onDetailDismiss]);
  useLayoutEffect(() => {
    if (!root) return;
    const stopInsets = trackModalViewportInsets(root);
    return () => { stopInsets(); detailMotion.current?.dispose(); detailMotion.current = null; };
  }, [root]);
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
    const sheet = surface.matches('[data-testid="form-sheet"], [data-testid="picker-sheet"], [data-testid="note-editor"]');
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
    if (presentedDetail || (sheet && typeof surface.animate === 'function')) {
      detailMotion.current ??= createDetailMotion(surface, viewport, presentedOrigin, () => dismiss.current?.());
      detailMotion.current.setOrigin(presentedOrigin);
      return detailMotion.current.setOpen(open, reduced, finish, presentedDetail ? 'detail' : surface.dataset.testid === 'picker-sheet' ? 'picker' : 'form');
    }
    detailMotion.current?.suspend();
    if (open) return;
    if (reduced) {
      finish();
      return;
    }
    return waitForMotion([surface, viewport], finish, motionMs(`--${motion}-close-dur`, 150));
  }, [root, open, motion, reduced, releaseExit, presentedDetail, presentedOrigin]);
  return <Modal {...props} visible={open || mounted} animationType="none" onRequestClose={open ? onRequestClose : undefined}>
    <div ref={setRoot} className="motion-overlay" inert={!open} aria-hidden={!open} style={{ display: 'flex', flex: 1, minHeight: 0 }}>
      {open ? children : snapshot.children}
    </div>
  </Modal>;
}
