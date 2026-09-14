/** One selected ticket owns the transition; inactive routes never keep names. */
type Direction = 'open' | 'close';
type Surface = { root: HTMLElement; title: HTMLElement; art: HTMLElement | null; paper: HTMLElement | null };
type Origin = { scrollTop: number; ticketTop: number };
type Transition = { ready: Promise<void>; finished: Promise<void>; updateCallbackDone: Promise<void>; skipTransition: () => void };
const origins = new Map<string, Origin>();
let active: { tripId: string; direction: Direction; cancel: () => void } | undefined;

function visible(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  return element.isConnected && rect.width > 0 && rect.height > 0 && !element.closest('[aria-hidden="true"], [inert]') && getComputedStyle(element).visibility !== 'hidden';
}

function surface(tripId: string, side: 'ticket' | 'workspace'): Surface | undefined {
  const id = `trip-${side}-${encodeURIComponent(tripId)}`;
  const root = [...document.querySelectorAll<HTMLElement>(`[id="${id}"]`)].find(visible);
  const title = root?.querySelector<HTMLElement>(`[data-testid="${side === 'ticket' ? 'trip-ticket-title' : 'trip-title'}"]`);
  if (!root || !title || !visible(title)) return;
  return { root, title, art: root.querySelector<HTMLElement>(`[data-testid="${side === 'ticket' ? 'trip-ticket-art' : 'trip-hero-art'}"]`), paper: side === 'workspace' ? root.querySelector<HTMLElement>('[data-testid="itinerary-scroll"]') : null };
}

// Keep these mounted pages settled after the shared snapshot disappears. Merely
// removing the global override would restart their ordinary entry animation.
function settlePage(value: Surface) {
  const parent = value.root.closest<HTMLElement>('.motion-page-content');
  if (parent) parent.dataset.tripReveal = 'settled';
  value.root.querySelectorAll<HTMLElement>('.motion-page-content').forEach((page) => { page.dataset.tripReveal = 'settled'; });
}

function restoreOrigin(tripId: string, target: Surface) {
  const origin = origins.get(tripId);
  const scroll = target.root.closest<HTMLElement>('[data-testid="home-scroll"]');
  if (!origin || !scroll) return;
  scroll.scrollTop = origin.scrollTop;
  // Search results or newly added trips may change the list above this ticket.
  // Keep the selected ticket in view rather than flying toward an offscreen item.
  const rect = target.root.getBoundingClientRect();
  const desired = Math.max(scroll.getBoundingClientRect().top, Math.min(origin.ticketTop, window.innerHeight - Math.min(rect.height, window.innerHeight / 2)));
  scroll.scrollTop += rect.top - desired;
}

/** Navigate immediately when motion is unavailable; no network or image wait. */
export function navigateTrip(tripId: string, direction: Direction, navigate: () => void) {
  if (typeof document === 'undefined' || typeof window === 'undefined') { navigate(); return; }
  if (active?.tripId === tripId && active.direction === direction) return;
  active?.cancel();
  const source = surface(tripId, direction === 'open' ? 'ticket' : 'workspace');
  if (direction === 'open' && source) {
    origins.set(tripId, { scrollTop: source.root.closest<HTMLElement>('[data-testid="home-scroll"]')?.scrollTop ?? 0, ticketTop: source.root.getBoundingClientRect().top });
  }
  let cancelled = false, navigated = false, interrupted = false;
  let transition: Transition | undefined;
  let stopWaiting = () => {};
  const restores: (() => void)[] = [];
  const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const html = document.documentElement;
  const operation = { tripId, direction, cancel: () => { cancelled = true; transition?.skipTransition(); stopWaiting(); cleanup(); } };
  const cleanup = () => {
    stopWaiting();
    while (restores.length) restores.pop()?.();
    window.removeEventListener('pointerdown', interrupt, true);
    window.removeEventListener('keydown', interrupt, true);
    window.removeEventListener('wheel', interrupt, true);
    window.removeEventListener('resize', interrupt);
    media?.removeEventListener('change', interrupt);
    if (active === operation) { delete html.dataset.tripTransition; active = undefined; }
  };
  const interrupt = () => { interrupted = true; transition?.skipTransition(); };
  const navigateOnce = () => { if (!cancelled && !navigated) { navigated = true; navigate(); } };
  const name = (element: HTMLElement | null, value: string) => {
    if (!element || !visible(element)) return;
    const old = element.style.viewTransitionName;
    element.style.viewTransitionName = value;
    restores.push(() => { element.style.viewTransitionName = old; });
  };
  const waitForTarget = () => new Promise<Surface | undefined>((resolve) => {
    let frame = 0, done = false, previous = '';
    const finish = (value?: Surface) => { if (done) return; done = true; window.clearTimeout(frame); window.clearTimeout(timeout); resolve(value); };
    // A stale/deleted route or suspended document must never keep a snapshot up.
    const timeout = window.setTimeout(() => finish(), 600);
    stopWaiting = () => finish();
    const check = () => {
      if (cancelled) { finish(); return; }
      const target = surface(tripId, direction === 'open' ? 'workspace' : 'ticket');
      if (target) {
        if (direction === 'close') restoreOrigin(tripId, target);
        const rect = target.title.getBoundingClientRect();
        const signature = `${rect.x},${rect.y},${rect.width},${rect.height}`;
        // Rendering (including rAF) is paused inside startViewTransition.
        // Timers still let React commit before measuring the next snapshot.
        if (signature === previous) { finish(target); return; }
        previous = signature;
      }
      frame = window.setTimeout(check, 16);
    };
    check();
  });
  active = operation;
  const start = document.startViewTransition?.bind(document);
  // A direct link has no origin. Preserve the ordinary router behavior there.
  if (!source || !origins.has(tripId) || !start || media?.matches || document.hidden) {
    navigateOnce();
    if (direction === 'close' && origins.has(tripId)) void waitForTarget().then(cleanup);
    else cleanup();
    return;
  }
  settlePage(source);
  html.dataset.tripTransition = direction;
  const trigger = source.root.closest<HTMLElement>('[role="button"]');
  if (trigger) { trigger.dataset.tripTrigger = ''; restores.push(() => { delete trigger.dataset.tripTrigger; }); }
  name(source.title, 'tabi-trip-title');
  // Desktop keeps its existing workspace layout; only the title is shared there.
  const shareArt = window.innerWidth < 1024 && Boolean(source.art);
  if (shareArt) name(source.art, 'tabi-trip-art');
  if (direction === 'close') name(source.paper, 'tabi-trip-paper');
  let target: Surface | undefined;
  try {
    transition = start(async () => {
      // Stack may retain the outgoing DOM. Remove names before naming its peer.
      while (restores.length) restores.pop()?.();
      if (cancelled) return;
      navigateOnce();
      target = await waitForTarget();
      if (!target || cancelled) { transition?.skipTransition(); return; }
      settlePage(target);
      name(target.title, 'tabi-trip-title');
      if (shareArt) name(target.art, 'tabi-trip-art');
      if (direction === 'open') name(target.paper, 'tabi-trip-paper');
    });
    window.addEventListener('pointerdown', interrupt, true);
    window.addEventListener('keydown', interrupt, true);
    window.addEventListener('wheel', interrupt, { capture: true, passive: true });
    window.addEventListener('resize', interrupt);
    media?.addEventListener('change', interrupt);
    void transition.ready.catch(() => {});
    void transition.updateCallbackDone.catch(() => {});
    void transition.finished.then(() => {
      if (!cancelled && !interrupted && target && active === operation) {
        const focused = document.activeElement;
        if (!focused || focused === document.body || source.root.contains(focused)) {
          const focusTarget = direction === 'close' ? target.root.closest<HTMLElement>('[role="button"]') : target.title;
          if (focusTarget) { if (direction === 'open') focusTarget.tabIndex = -1; focusTarget.focus({ preventScroll: true }); }
        }
      }
      cleanup();
    }, cleanup);
  } catch {
    navigateOnce();
    cleanup();
  }
}

/** Browser Back/Forward uses the same visible source without replacing history. */
export function installTripHistory() {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;
  const onPopState = () => {
    const path = window.location.pathname;
    const workspace = [...document.querySelectorAll<HTMLElement>('[data-testid="trip-workspace"]')].find(visible);
    if (path === '/' && workspace) {
      const tripId = decodeURIComponent(workspace.id.slice('trip-workspace-'.length));
      if (origins.has(tripId)) navigateTrip(tripId, 'close', () => {});
    } else {
      const match = path.match(/^\/trips\/([^/]+)\/(?:itinerary|packing|bookings|places|notes)\/?$/);
      if (match && !workspace) {
        const tripId = decodeURIComponent(match[1]);
        if (origins.has(tripId)) navigateTrip(tripId, 'open', () => {});
      }
    }
  };
  window.addEventListener('popstate', onPopState, true);
  return () => { window.removeEventListener('popstate', onPopState, true); active?.cancel(); origins.clear(); };
}
