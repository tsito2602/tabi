import { useLayoutEffect, useRef } from 'react';
import { usePalette } from '@/theme/theme-provider';
export function MotionCheck({ checked }: { checked: boolean }) {
  const path = useRef<SVGPathElement>(null);
  const palette = usePalette();
  useLayoutEffect(() => {
    const element = path.current!;
    const control = element.closest('[role="checkbox"]') as HTMLElement;
    control.classList.add('t-check');
    control.style.setProperty('--check-len', String(Math.ceil(element.getTotalLength()) + 1));
    return () => { control.classList.remove('t-check'); control.style.removeProperty('--check-len'); };
  }, []);
  return <svg aria-hidden="true" width="16" height="16" viewBox="0 0 12 12" style={{ color: palette.onOcean }} data-checked={checked}><path ref={path} d="M2 6L4.7 8.7L10 3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
