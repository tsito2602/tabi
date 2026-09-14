import { createContext, PropsWithChildren, ReactNode, useLayoutEffect, useMemo, useRef, useState } from 'react';

export const MotionPresenceContext = createContext(true);
export const MotionExitContext = createContext<{ register: () => () => void } | null>(null);

// The editor owns its state; its portals report when every exit has finished.
// There is no competing parent timer that can cut off a sheet or nested dialog.
export function MotionPresence({ children }: PropsWithChildren) {
  const open = Boolean(children);
  const present = useRef(open);
  const alive = useRef(false);
  const pending = useRef(new Set<symbol>());
  const [previous, setPrevious] = useState(children);
  const [retained, setRetained] = useState<ReactNode>(children);
  if (children !== previous) {
    setPrevious(children);
    if (open) setRetained(children);
  }
  const exits = useMemo(() => ({
    register: () => {
      const id = Symbol('modal-exit');
      pending.current.add(id);
      return () => {
        pending.current.delete(id);
        // Check after the commit: another portal may register or reopen in
        // the same layout pass (including StrictMode effect replays).
        queueMicrotask(() => {
          if (alive.current && !present.current && pending.current.size === 0) setRetained(null);
        });
      };
    },
  }), []);
  useLayoutEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);
  useLayoutEffect(() => {
    present.current = open;
    if (!open && pending.current.size === 0) setRetained(null);
  }, [open]);
  return <MotionExitContext.Provider value={exits}>
    <MotionPresenceContext.Provider value={open}>{open ? children : retained}</MotionPresenceContext.Provider>
  </MotionExitContext.Provider>;
}
