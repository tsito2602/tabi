import { useLayoutEffect, useRef } from 'react';
import { View, ViewProps } from 'react-native';

// Works with variable-width, wrapping and horizontally scrolling RN tabs.
export function MotionTabs({ children, ...props }: ViewProps) {
  const root = useRef<View>(null);
  useLayoutEffect(() => {
    const bar = root.current as unknown as HTMLElement;
    const pill = document.createElement('span');
    pill.className = 't-tabs-pill';
    pill.setAttribute('aria-hidden', 'true');
    bar.classList.add('motion-tabs');
    bar.appendChild(pill);
    let active: HTMLElement | null = null;
    const move = (animate: boolean) => {
      const tab = bar.querySelector<HTMLElement>('[aria-selected="true"]');
      if (!tab) { pill.style.visibility = 'hidden'; return; }
      pill.style.visibility = '';
      if (!animate) pill.style.transition = 'none';
      pill.style.transform = `translate(${tab.offsetLeft}px, ${tab.offsetTop}px)`;
      pill.style.width = `${tab.offsetWidth}px`;
      pill.style.height = `${tab.offsetHeight}px`;
      pill.style.borderRadius = getComputedStyle(tab).borderRadius;
      if (!animate) { void pill.offsetWidth; pill.style.transition = ''; }
      active = tab;
    };
    move(false);
    const observer = new MutationObserver(() => move(active !== null));
    observer.observe(bar, { subtree: true, attributes: true, attributeFilter: ['aria-selected'], childList: true, characterData: true });
    const resize = new ResizeObserver(() => move(false));
    resize.observe(bar);
    bar.querySelectorAll('[role="tab"]').forEach((tab) => resize.observe(tab));
    return () => { observer.disconnect(); resize.disconnect(); pill.remove(); bar.classList.remove('motion-tabs'); };
  }, []);
  return <View {...props} ref={root}>{children}</View>;
}
