import { PropsWithChildren } from 'react';

// Router owns screen lifetimes. Do not retain a second live Slot or force a
// synchronous layout just to start the incoming page's short, unblurred reveal.
export function MotionPage({ children }: PropsWithChildren) {
  return <div className="motion-page">
    <div className="motion-page-content" data-testid="route-transition">{children}</div>
  </div>;
}
