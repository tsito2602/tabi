import { PropsWithChildren, useLayoutEffect, useRef } from 'react';

// Router owns screen lifetimes. Animate the incoming section without retaining
// an outgoing Slot that would subscribe to the new route a second time.
export function MotionPage({ children }: PropsWithChildren) {
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { if (root.current) { void root.current.offsetWidth; root.current.dataset.page = '2'; } }, []);
  return <div ref={root} className="t-page-slide motion-page" data-page="1">
    <div className="t-page" data-page-id="2" data-testid="route-transition">{children}</div>
  </div>;
}
