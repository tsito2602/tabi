import { PropsWithChildren, useId, useState } from 'react';
export function Collapsible({ children, title }: PropsWithChildren & { title: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return <div className="t-acc" data-open={open}>
    <button type="button" className="motion-accordion-head" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
      <span className="t-acc-chevron" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 16 16"><path d="M4 6.5L8 10.5L12 6.5" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg></span>{title}
    </button>
    <div className="t-acc-panel" id={id} inert={!open} aria-hidden={!open}><div className="t-acc-panel-inner"><div className="motion-accordion-content">{children}</div></div></div>
  </div>;
}
