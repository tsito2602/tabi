import type { PlanSource } from '../data/planner';
import type { PlacementSlot } from '../data/itinerary-placement';

export const edgeScrollSpeed = (position: number, start: number, end: number) => {
  const zone = Math.min(48, (end - start) / 4);
  if (position < start || position > end || zone <= 0) return 0;
  if (position < start + zone) return -Math.ceil(12 * (1 - (position - start) / zone));
  if (position > end - zone) return Math.ceil(12 * (1 - (end - position) / zone));
  return 0;
};
export function parsePlanSource(raw: string | undefined): PlanSource | null {
  try {
    const value = JSON.parse(raw ?? '');
    return value && (value.kind === 'place' || value.kind === 'item') && typeof value.id === 'string' && value.id.length > 0 && value.id.length <= 100 ? { kind: value.kind, id: value.id } : null;
  } catch { return null; }
}
// Touch candidates reserve horizontal movement for their native ScrollView.
// An itinerary card (or mouse/pen) starts dragging after movement, never a timer.
export function plannerGestureIntent(dx: number, dy: number, touch: boolean, gesture: 'lift' | 'free'): 'pending' | 'scroll' | 'drag' {
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || Math.hypot(dx, dy) <= 7) return 'pending';
  if (touch && gesture === 'lift' && Math.abs(dx) >= Math.abs(dy)) return 'scroll';
  return 'drag';
}
type Callbacks = { start: (source: PlanSource) => void; drop: (source: PlanSource, slot: PlacementSlot) => void; day: (day: string) => void; cancel: () => void };

/** Pointer-only enhancement. Buttons supply the independent tap/keyboard path. */
export function attachPlannerPointer(root: HTMLElement, callbacks: Callbacks) {
  const doc = root.ownerDocument, win = doc.defaultView!;
  let frame = 0, suppressUntil = 0;
  let suppressedSource: HTMLElement | undefined;
  let active: { source: PlanSource; handle: HTMLElement; id: number; x: number; y: number; startX: number; startY: number; offsetX: number; offsetY: number; started: boolean; touch: boolean; gesture: 'lift' | 'free' } | undefined;
  let ghost: HTMLElement | undefined, over: HTMLElement | undefined, lifted: HTMLElement | undefined;
  let dayHover = '', dayAt = 0, activatedDay = '';
  const clear = () => {
    win.cancelAnimationFrame(frame); frame = 0;
    const old = active; active = undefined;
    ghost?.remove(); ghost = undefined; over?.classList.remove('is-over'); over = undefined;
    if (lifted) delete lifted.dataset.planLifted; lifted = undefined;
    delete root.dataset.planDragging;
    dayHover = ''; activatedDay = '';
    if (old?.handle.hasPointerCapture?.(old.id)) try { old.handle.releasePointerCapture(old.id); } catch { /* already released */ }
  };
  const suppressClick = () => { suppressUntil = Date.now() + 350; suppressedSource = active?.handle; };
  const cancel = () => { const started = active?.started; if (started) suppressClick(); clear(); if (started) callbacks.cancel(); };
  const targetAt = (x: number, y: number) => {
    const element = doc.elementFromPoint(x, y);
    if (!element || !root.contains(element) || element.closest('[aria-hidden="true"], [inert]')) return null;
    const direct = element.closest<HTMLElement>('[data-plan-drop]');
    if (direct && !direct.hasAttribute('disabled')) return direct;
    const row = element.closest<HTMLElement>('[data-plan-entry]');
    if (!row) return null;
    const rect = row.getBoundingClientRect();
    const key = y < rect.top + rect.height / 2 ? 'planBefore' : 'planAfter';
    return [...root.querySelectorAll<HTMLElement>('[data-plan-drop]:not([disabled])')].find(slot => slot.dataset[key] === row.dataset.planEntry) ?? null;
  };
  const tick = (time: number) => {
    if (!active?.started) return;
    if (!active.handle.isConnected || doc.querySelector('[aria-modal="true"]')) { cancel(); return; }
    const { x, y, offsetX, offsetY, touch } = active;
    if (ghost) ghost.style.transform = `translate3d(${x - offsetX}px, ${y - offsetY - (touch ? 16 : 0)}px, 0)`;
    const hit = doc.elementFromPoint(x, y);
    const day = hit?.closest<HTMLElement>('[data-plan-day]')?.dataset.planDay ?? '';
    if (day !== dayHover) { dayHover = day; dayAt = time; }
    if (day && day !== activatedDay && time - dayAt > 450) { activatedDay = day; callbacks.day(day); }
    const scroll = hit?.closest<HTMLElement>('[data-testid="itinerary-scroll"], [data-testid="planner-candidates"]');
    if (scroll && root.contains(scroll)) {
      const rect = scroll.getBoundingClientRect();
      if (scroll.dataset.testid === 'planner-candidates') scroll.scrollLeft += edgeScrollSpeed(x, rect.left, rect.right);
      else scroll.scrollTop += edgeScrollSpeed(y, rect.top, rect.bottom);
    }
    const target = targetAt(x, y);
    if (target !== over) { over?.classList.remove('is-over'); over = target ?? undefined; over?.classList.add('is-over'); }
    frame = win.requestAnimationFrame(tick);
  };
  const begin = () => {
    if (!active || active.started) return;
    const card = active.handle.closest<HTMLElement>('[data-plan-card]');
    if (!card) { cancel(); return; }
    // Capture only a real drag: capturing on pointerdown retargets an ordinary
    // tap away from the nested detail Pressable and steals horizontal scrolling.
    try { active.handle.setPointerCapture(active.id); } catch { clear(); return; }
    active.started = true; root.dataset.planDragging = '';
    const rect = card.getBoundingClientRect();
    active.offsetX = Math.max(0, Math.min(active.startX - rect.left, rect.width));
    active.offsetY = Math.max(0, Math.min(active.startY - rect.top, rect.height));
    ghost = card.cloneNode(true) as HTMLElement;
    ghost.classList.add('planner-ghost'); ghost.setAttribute('aria-hidden', 'true'); ghost.inert = true;
    ghost.style.width = `${rect.width}px`; ghost.style.margin = '0';
    ghost.removeAttribute('id'); ghost.removeAttribute('data-plan-card'); ghost.removeAttribute('data-plan-source');
    ghost.querySelectorAll('[id], [data-testid]').forEach(e => { e.removeAttribute('id'); e.removeAttribute('data-testid'); });
    ghost.querySelectorAll('button, [role="button"], a, input, textarea').forEach(e => e.setAttribute('tabindex', '-1'));
    doc.body.appendChild(ghost);
    if (active.source.kind === 'item') { lifted = card; lifted.dataset.planLifted = ''; }
    callbacks.start(active.source);
    frame = win.requestAnimationFrame(tick);
  };
  const down = (event: PointerEvent) => {
    if (active) { if (event.pointerId !== active.id) cancel(); return; }
    if (!event.isPrimary || event.button !== 0 || !(event.target instanceof win.Element)) return;
    suppressedSource = undefined;
    if (doc.querySelector('[aria-modal="true"]') || event.target.closest('input, textarea, select, a, [contenteditable="true"], [data-plan-no-drag]')) return;
    const handle = event.target.closest<HTMLElement>('[data-plan-source]');
    if (!handle || !root.contains(handle) || handle.hasAttribute('disabled') || handle.closest('[aria-disabled="true"], [aria-hidden="true"], [inert]')) return;
    const source = parsePlanSource(handle.dataset.planSource);
    if (!source) return;
    const gesture = handle.closest<HTMLElement>('[data-plan-card]')?.dataset.planGesture === 'lift' ? 'lift' : 'free';
    active = { source, handle, gesture, id: event.pointerId, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, offsetX: 0, offsetY: 0, started: false, touch: event.pointerType === 'touch' };
  };
  const move = (event: PointerEvent) => {
    if (!active || event.pointerId !== active.id) return;
    active.x = event.clientX; active.y = event.clientY;
    if (!active.started) {
      const intent = plannerGestureIntent(active.x - active.startX, active.y - active.startY, active.touch, active.gesture);
      if (intent === 'scroll') { clear(); return; }
      if (intent === 'drag') begin();
    }
    if (active?.started) event.preventDefault();
  };
  const up = (event: PointerEvent) => {
    if (!active || event.pointerId !== active.id) return;
    const source = active.source, started = active.started;
    const target = started ? targetAt(event.clientX, event.clientY) : null;
    const slot = target?.dataset.planDrop;
    if (started) { suppressClick(); event.preventDefault(); }
    clear();
    if (!started) return;
    if (slot) {
      try { callbacks.drop(source, JSON.parse(slot) as PlacementSlot); } catch { callbacks.cancel(); }
    } else callbacks.cancel();
  };
  const interrupted = (event: PointerEvent) => { if (active?.id === event.pointerId) cancel(); };
  const click = (event: MouseEvent) => {
    if (event.detail !== 0 && Date.now() < suppressUntil && event.target instanceof win.Element && suppressedSource?.contains(event.target)) {
      event.preventDefault(); event.stopPropagation(); suppressedSource = undefined;
    }
  };
  const contextMenu = (event: Event) => { if (active?.touch) event.preventDefault(); };
  const key = (event: KeyboardEvent) => { if (event.key === 'Escape' && active) { event.preventDefault(); cancel(); } };
  const visibility = () => { if (doc.hidden) cancel(); };
  // Capture pointerdown before React Native Web's nested Pressable responder can
  // stop bubbling. We still defer pointer capture until an actual drag begins.
  root.addEventListener('pointerdown', down, true);
  root.addEventListener('click', click, true);
  root.addEventListener('contextmenu', contextMenu);
  win.addEventListener('pointermove', move, { passive: false });
  win.addEventListener('pointerup', up);
  win.addEventListener('pointercancel', interrupted);
  root.addEventListener('lostpointercapture', interrupted);
  win.addEventListener('keydown', key);
  win.addEventListener('blur', cancel);
  doc.addEventListener('visibilitychange', visibility);
  return () => {
    clear(); root.removeEventListener('pointerdown', down, true); root.removeEventListener('click', click, true);
    root.removeEventListener('contextmenu', contextMenu);
    win.removeEventListener('pointermove', move); win.removeEventListener('pointerup', up); win.removeEventListener('pointercancel', interrupted);
    root.removeEventListener('lostpointercapture', interrupted); win.removeEventListener('keydown', key); win.removeEventListener('blur', cancel);
    doc.removeEventListener('visibilitychange', visibility);
  };
}
