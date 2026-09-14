import { useLayoutEffect, useRef } from 'react';
import { View, ViewProps } from 'react-native';

// Track geometry, not observer frequency: a redundant resize callback must not
// cancel the pill's in-flight selection transition.
export function MotionTabs({ children, ...props }: ViewProps) {
  const root = useRef<View>(null);
  useLayoutEffect(() => {
    const bar = root.current as unknown as HTMLElement;
    const pill = document.createElement('span');
    pill.className = 't-tabs-pill';
    pill.setAttribute('aria-hidden', 'true');
    bar.classList.add('motion-tabs');
    bar.appendChild(pill);
    let frame = '';
    let active: HTMLElement | null = null;
    const move = (animate: boolean) => {
      const tab = bar.querySelector<HTMLElement>('[aria-selected="true"]');
      if (!tab) { pill.style.visibility = 'hidden'; active = null; frame = ''; return; }
      const next = `${tab.offsetLeft},${tab.offsetTop},${tab.offsetWidth},${tab.offsetHeight},${getComputedStyle(tab).borderRadius}`;
      pill.style.visibility = '';
      active = tab;
      if (next === frame) return;
      frame = next;
      if (!animate) pill.style.transition = 'none';
      pill.style.transform = `translate(${tab.offsetLeft}px, ${tab.offsetTop}px)`;
      pill.style.width = `${tab.offsetWidth}px`;
      pill.style.height = `${tab.offsetHeight}px`;
      pill.style.borderRadius = getComputedStyle(tab).borderRadius;
      if (!animate) { void pill.offsetWidth; pill.style.transition = ''; }
    };
    const observed = new Set<Element>();
    const resize = new ResizeObserver(() => move(false));
    const observeTabs = () => {
      const tabs = new Set(bar.querySelectorAll('[role="tab"]'));
      for (const tab of observed) if (!tabs.has(tab)) { resize.unobserve(tab); observed.delete(tab); }
      for (const tab of tabs) if (!observed.has(tab)) { resize.observe(tab); observed.add(tab); }
    };
    move(false);
    resize.observe(bar);
    observeTabs();
    const observer = new MutationObserver(() => { observeTabs(); move(active !== null); });
    observer.observe(bar, { subtree: true, attributes: true, attributeFilter: ['aria-selected'], childList: true, characterData: true });
    return () => { observer.disconnect(); resize.disconnect(); pill.remove(); bar.classList.remove('motion-tabs'); };
  }, []);
  return <View {...props} ref={root}>{children}</View>;
}
