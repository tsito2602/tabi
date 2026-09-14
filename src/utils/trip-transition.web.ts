type Direction = 'open' | 'close';
type Transition = { ready: Promise<void>; finished: Promise<void>; updateCallbackDone?: Promise<void>; skipTransition: () => void };
type TransitionDocument = Document & { startViewTransition?: (update: () => Promise<void>) => Transition };
type Operation = {
  direction: Direction;
  tripId: string;
  dead: boolean;
  decorate: boolean;
  transition?: Transition;
  update?: Promise<void>;
  cancelWait?: () => void;
  checkDestination?: () => void;
  names: (() => void)[];
};

// A single controller per authenticated workspace. No trip data enters storage.
export function createTripTransitionController(doc: Document) {
  const win = doc.defaultView!;
  let active: Operation | undefined;
  let renderedPath: string | undefined;
  let saved = { tripId: '', y: 0, search: '' };
  const reduced = () => win.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  // Native-stack may retain a hidden copy of the list after replace('/').
  // Resolve the visible screen rather than the first duplicate nativeID.
  const liveById = (id: string) => {
    const first = doc.getElementById(id);
    return visible(first) ? first : Array.from(doc.querySelectorAll<HTMLElement>('[id]')).find((element) => element.id === id && visible(element)) ?? null;
  };
  const ticket = (id: string) => liveById(`trip-ticket-${id}`);
  const workspace = (id: string) => liveById(`trip-workspace-${id}`);
  const list = () => liveById('trip-list-ready');
  const atDestination = (op: Operation) => {
    const path = (renderedPath ?? win.location.pathname).replace(/\/$/, '') || '/';
    return op.direction === 'close' ? path === '/' : path === `/trips/${encodeURIComponent(op.tripId)}/itinerary`;
  };
  const visible = (element: HTMLElement | null): element is HTMLElement => Boolean(element && !element.closest('[aria-hidden="true"], [inert]') && element.getClientRects().length);
  const clearNames = (op: Operation) => { op.names.splice(0).forEach((restore) => restore()); };
  const undecorate = (op: Operation) => {
    op.decorate = false;
    clearNames(op);
    if (active === op) doc.documentElement.removeAttribute('data-trip-transition');
  };
  const finish = (op: Operation) => {
    undecorate(op);
    op.cancelWait?.();
    if (active === op) active = undefined;
  };
  const abandon = () => {
    if (!active) return;
    const op = active;
    op.dead = true;
    op.transition?.skipTransition();
    finish(op);
  };
  const skipAnimation = () => {
    if (!active) return;
    active.transition?.skipTransition();
    undecorate(active);
  };
  const name = (op: Operation, element: HTMLElement | null, value: string) => {
    if (!visible(element)) return;
    const previous = element.style.getPropertyValue('view-transition-name');
    const priority = element.style.getPropertyPriority('view-transition-name');
    element.style.setProperty('view-transition-name', value);
    op.names.push(() => previous ? element.style.setProperty('view-transition-name', previous, priority) : element.style.removeProperty('view-transition-name'));
  };
  const decorate = (op: Operation, root: HTMLElement | null, isTicket: boolean) => {
    if (!root) return;
    name(op, root.querySelector(isTicket ? '[data-testid="trip-ticket-cover"]' : '[data-testid="trip-hero-cover"]'), 'tabi-trip-cover');
    name(op, root.querySelector(isTicket ? '[data-testid="trip-ticket-title"]' : '[data-testid="trip-name"]'), 'tabi-trip-title');
    if (!isTicket) {
      name(op, root.querySelector('[data-testid="trip-header"]'), 'tabi-trip-header');
      name(op, root.querySelector('[data-testid="itinerary-scroll"]'), 'tabi-trip-paper');
    }
  };
  const findDestination = (op: Operation) => {
    if (!atDestination(op)) return null;
    const root = op.direction === 'open' ? workspace(op.tripId) : list();
    if (!visible(root)) return null;
    if (op.direction === 'open' && !root.querySelector('[data-testid="trip-name"]')) return null;
    return root;
  };
  const waitForDestination = (op: Operation) => new Promise<HTMLElement | null>((resolve) => {
    let ended = false;
    const observer = new win.MutationObserver(check);
    const timeout = win.setTimeout(() => end(null), 450);
    function end(root: HTMLElement | null) {
      if (ended) return;
      ended = true;
      observer.disconnect();
      win.clearTimeout(timeout);
      op.cancelWait = undefined;
      op.checkDestination = undefined;
      resolve(root);
    }
    function check() {
      if (op.dead) { end(null); return; }
      const root = findDestination(op);
      if (root) end(root);
    }
    op.cancelWait = () => end(null);
    op.checkDestination = check;
    observer.observe(doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['id', 'style', 'aria-hidden', 'inert'] });
    check();
  });
  const restoreList = () => {
    const root = list();
    if (root) root.scrollTop = saved.y;
  };
  const focusDestination = (op: Operation) => {
    const target = op.direction === 'open'
      ? workspace(op.tripId)?.querySelector<HTMLElement>('[data-testid="trip-name"]')
      : ticket(op.tripId)?.closest<HTMLElement>('[role="button"], button');
    if (!target) return;
    if (!target.hasAttribute('tabindex')) target.tabIndex = -1;
    target.focus({ preventScroll: true });
  };
  const run = (direction: Direction, tripId: string, navigate: () => void, animate = true) => {
    abandon();
    if (direction === 'open') saved = { ...saved, tripId, y: list()?.scrollTop ?? 0 };
    const source = direction === 'open' ? ticket(tripId) : workspace(tripId);
    const op: Operation = { direction, tripId, dead: false, decorate: false, names: [] };
    active = op;
    const update = () => op.update ??= (async () => {
      if (op.dead) return;
      clearNames(op); // Old snapshots are captured; never name both live screens.
      navigate();
      const destination = await waitForDestination(op);
      if (op.dead) return;
      if (!destination) { op.transition?.skipTransition(); return; }
      if (direction === 'close') restoreList();
      if (op.decorate) {
        // Keep this mounted page settled after snapshot cleanup; restoring the
        // ordinary entrance animation would fade the journal a second time.
        const page = destination.closest<HTMLElement>('.motion-page-content') ?? destination.querySelector<HTMLElement>('.motion-page-content');
        page?.setAttribute('data-trip-journey-page', '');
        decorate(op, direction === 'open' ? destination : ticket(tripId), direction === 'close');
      }
      focusDestination(op);
    })();
    const vtDoc = doc as TransitionDocument;
    if (animate && !reduced() && doc.visibilityState !== 'hidden' && visible(source) && !doc.querySelector('[aria-modal="true"]') && typeof vtDoc.startViewTransition === 'function') {
      op.decorate = true;
      doc.documentElement.setAttribute('data-trip-transition', direction);
      decorate(op, source, direction === 'open');
      try {
        op.transition = vtDoc.startViewTransition(update);
        void op.transition.ready.catch(() => undecorate(op));
        void op.transition.updateCallbackDone?.catch(() => finish(op));
        void op.transition.finished.then(() => finish(op), () => finish(op));
        return;
      } catch {
        // A rejected snapshot must not drop or duplicate the user's navigation.
        undecorate(op);
      }
    }
    void update().then(() => finish(op), () => finish(op));
  };
  const routeDidRender = (pathname: string) => {
    // The router can commit before its browser-history effect. Use its actual
    // rendered route, not a briefly stale location.pathname, to settle capture.
    renderedPath = pathname;
    active?.checkDestination?.();
    if (active && !atDestination(active)) abandon();
    // Browser Back / sidebar navigation restores the list without intercepting
    // history events or replaying an entrance animation on direct page loads.
    if (pathname === '/' && saved.tripId && !active) run('close', saved.tripId, () => {}, false);
  };
  const install = () => {
    const changedPreference = () => { if (reduced()) skipAnimation(); };
    const media = win.matchMedia?.('(prefers-reduced-motion: reduce)');
    doc.addEventListener('pointerdown', skipAnimation, true);
    doc.addEventListener('keydown', skipAnimation, true);
    doc.addEventListener('visibilitychange', skipAnimation);
    win.addEventListener('resize', skipAnimation);
    win.addEventListener('popstate', abandon, true);
    media?.addEventListener('change', changedPreference);
    return () => {
      abandon();
      saved = { tripId: '', y: 0, search: '' };
      doc.removeEventListener('pointerdown', skipAnimation, true);
      doc.removeEventListener('keydown', skipAnimation, true);
      doc.removeEventListener('visibilitychange', skipAnimation);
      win.removeEventListener('resize', skipAnimation);
      win.removeEventListener('popstate', abandon, true);
      media?.removeEventListener('change', changedPreference);
    };
  };
  return { run, routeDidRender, install, getSearch: () => saved.search, setSearch: (search: string) => { saved.search = search; } };
}

let controller: ReturnType<typeof createTripTransitionController> | undefined;
function current() {
  if (typeof document === 'undefined') return undefined;
  return controller ??= createTripTransitionController(document);
}
export function openTripTransition(tripId: string, navigate: () => void) {
  const instance = current();
  if (instance) instance.run('open', tripId, navigate); else navigate();
}
export function closeTripTransition(tripId: string, navigate: () => void) {
  const instance = current();
  if (instance) instance.run('close', tripId, navigate); else navigate();
}
export const getTripListSearch = () => current()?.getSearch() ?? '';
export const rememberTripListSearch = (search: string) => current()?.setSearch(search);
export const tripRouteDidRender = (pathname: string) => current()?.routeDidRender(pathname);
export function installTripTransitions() {
  const cleanup = current()?.install();
  return () => { cleanup?.(); controller = undefined; };
}
