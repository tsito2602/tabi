import { createContext, PropsWithChildren, ReactNode, useEffect, useState } from 'react';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { motionMs } from '@/utils/motion';

export const MotionPresenceContext = createContext(true);

// Keep the editor's state and contents alive through its exit, including when
// its parent conditionally removes the entire editor after a save.
export function MotionPresence({ children }: PropsWithChildren) {
  const reduced = useReducedMotion();
  const open = Boolean(children);
  const [previous, setPrevious] = useState(children);
  const [retained, setRetained] = useState<ReactNode>(children);
  if (children !== previous) {
    setPrevious(children);
    if (open) setRetained(children);
  }
  useEffect(() => {
    if (open) return;
    const timer = setTimeout(() => setRetained(null), reduced ? 0 : motionMs('--modal-close-dur', 150));
    return () => clearTimeout(timer);
  }, [open, reduced]);
  return <MotionPresenceContext.Provider value={open}>{open ? children : retained}</MotionPresenceContext.Provider>;
}
