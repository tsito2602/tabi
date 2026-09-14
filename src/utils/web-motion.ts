function milliseconds(value: string) {
  const number = Number.parseFloat(value);
  return Number.isFinite(number) ? number * (value.trim().endsWith('ms') ? 1 : 1000) : 0;
}

// Used only when the browser cannot expose the actual CSS transitions.
export function transitionMilliseconds(style: Pick<CSSStyleDeclaration, 'transitionProperty' | 'transitionDuration' | 'transitionDelay'>) {
  if (style.transitionProperty === 'none') return 0;
  if (!style.transitionDuration) return null;
  const durations = style.transitionDuration.split(',').map(milliseconds);
  const delays = (style.transitionDelay || '0s').split(',').map(milliseconds);
  const count = style.transitionProperty ? style.transitionProperty.split(',').length : durations.length;
  return Math.max(0, ...Array.from({ length: count }, (_, i) => durations[i % durations.length] + delays[i % delays.length]));
}

// Watch the surface and its backdrop, not descendants such as a loading spinner.
// Reversing an exit cancels this subscription, never the browser's animation.
export function waitForMotion(elements: HTMLElement[], complete: () => void, fallbackMs: number) {
  let cancelled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const finish = () => { if (!cancelled) { cancelled = true; complete(); } };
  if (elements.length && elements.every((element) => typeof element.getAnimations === 'function')) {
    const animations = [...new Set(elements.flatMap((element) => element.getAnimations({ subtree: true })))]
      .filter((animation) => {
        const effect = animation.effect as KeyframeEffect | null;
        return elements.includes(effect?.target as HTMLElement) && animation.playState !== 'finished' && animation.playState !== 'idle' && Number.isFinite(Number(effect?.getComputedTiming().endTime));
      });
    // A cancelled CSS transition rejects finished; either outcome ends its exit.
    void Promise.allSettled(animations.map((animation) => animation.finished)).then(finish);
  } else {
    const durations = elements.map((element) => transitionMilliseconds(getComputedStyle(element))).filter((duration): duration is number => duration !== null);
    timer = setTimeout(finish, durations.length ? Math.max(0, ...durations) : fallbackMs);
  }
  return () => { cancelled = true; if (timer !== undefined) clearTimeout(timer); };
}
