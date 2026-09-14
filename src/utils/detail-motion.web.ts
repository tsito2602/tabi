import type { DetailOrigin, DetailRect } from './detail-origin';
import { detailRect } from './detail-origin.web';

const ease = 'cubic-bezier(.22, 1, .36, 1)';
// Position settles slowly; opacity has its own gentler onset so content floats
// into view rather than becoming almost opaque on its first moving frames.
const revealEase = 'cubic-bezier(.2, .9, .2, 1)';
const revealDuration = 640;
const revealFadeEase = 'cubic-bezier(.3, 0, .35, 1)';
const revealFadeDuration = 420;
const returnEase = 'cubic-bezier(.4, 0, .2, 1)';
const revealStagger = 70;
const maxRevealSpread = 420;
const normal = { transform: 'translate3d(0px, 0px, 0px)', clipPath: 'inset(0px)', opacity: '1' };
export function detailPose(from: DetailRect, to: DetailRect, radius: number) {
  const scale = Math.max(1, from.width / to.width, from.height / to.height);
  const y = Math.max(0, (to.height - from.height / scale) / 2), x = Math.max(0, (to.width - from.width / scale) / 2);
  return { transform: `translate3d(${from.left + from.width / 2 - to.left - to.width / 2}px, ${from.top + from.height / 2 - to.top - to.height / 2}px, 0px)${scale > 1 ? ` scale(${scale})` : ''}`, clipPath: `inset(${y}px ${x}px round ${radius}px)`, opacity: '1' };
}

export type SheetMotionKind = 'detail' | 'form' | 'picker';

// One level of meaningful sections; never stagger calendar cells or both a
// field wrapper and its children. Form controls keep their original DOM nodes.
export function detailContentBlocks(content: HTMLElement): HTMLElement[] {
  const scroll = content.querySelector<HTMLElement>('[data-testid="form-sheet-scroll"], [data-testid="sheet-content-scroll"]');
  const header = content.querySelector<HTMLElement>('[data-testid="sheet-header"]');
  const footer = content.querySelector<HTMLElement>('[data-testid="sheet-footer"]');
  const wrappers = '[data-testid="place-details"], [data-testid="itinerary-item-details"], [data-testid="booking-details-summary"]';
  const sections = Array.from(scroll ? scroll.firstElementChild?.children ?? [] : content.children).flatMap((element) =>
    element.matches(wrappers) ? Array.from(element.children) : [element]);
  const win = content.ownerDocument.defaultView!;
  const blocks = [...new Set([scroll && header && !scroll.contains(header) ? header : null, ...sections, scroll && footer && !scroll.contains(footer) ? footer : null])].filter((element): element is HTMLElement =>
    element instanceof win.HTMLElement && element.getClientRects().length > 0
    && win.getComputedStyle(element).display !== 'none' && element.dataset.testid !== 'detail-dismiss-handle');
  return blocks.length ? blocks : [content];
}

/** Owns one mounted detail surface. CSS still owns layout and the backdrop. */
export function createDetailMotion(surface: HTMLElement, viewport: HTMLElement, origin: DetailOrigin | undefined, requestClose: () => void) {
  const doc = surface.ownerDocument, win = doc.defaultView!;
  const content = surface.querySelector<HTMLElement>('[data-testid="form-sheet-fill"]') ?? surface;
  let animations: Animation[] = [];
  let generation = 0, opened = false, isOpen = false, disposed = false;
  let lastKind: SheetMotionKind = 'detail';
  const restingOpacity = new WeakMap<HTMLElement, string>();
  let closingDone: (() => void) | undefined;
  let handle: HTMLElement | null = null;
  let drag: { id: number; startY: number; y: number; lastY: number; lastAt: number; velocity: number } | undefined;
  const reduce = () => win.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const source = () => {
    const element = origin?.element as HTMLElement | undefined;
    if (!element?.isConnected || !element.getClientRects().length) return;
    const rect = detailRect(element);
    if (rect.width <= 0 || rect.height <= 0 || rect.top >= win.innerHeight || rect.top + rect.height <= 0 || rect.left >= win.innerWidth || rect.left + rect.width <= 0) return;
    // The modal makes its background aria-hidden, so inspect scroll clipping
    // rather than treating that temporary accessibility state as deletion.
    for (let parent = element.parentElement; parent && parent !== doc.body; parent = parent.parentElement) {
      const css = win.getComputedStyle(parent);
      if (/(auto|scroll|hidden|clip)/.test(css.overflowY)) {
        const bounds = parent.getBoundingClientRect();
        if (rect.top >= bounds.bottom || rect.top + rect.height <= bounds.top) return;
      }
    }
    return { element, rect };
  };
  const cancel = () => {
    generation++;
    animations.splice(0).forEach((animation) => animation.cancel());
  };
  const play = (element: HTMLElement, frames: Keyframe[], duration: number, delay = 0, easing = ease) => {
    const animation = element.animate(frames, { duration, delay, easing, fill: 'both' });
    // Cancellation is expected when a close, edit or preference change wins.
    void animation.finished.catch(() => {});
    animations.push(animation);
    return animation;
  };
  const clearDrag = () => {
    const id = drag?.id;
    drag = undefined;
    if (id !== undefined && handle?.hasPointerCapture?.(id)) handle.releasePointerCapture(id);
    delete viewport.dataset.detailDrag;
    viewport.style.removeProperty('--detail-backdrop-opacity');
  };
  const resetStyles = () => {
    surface.style.removeProperty('transform');
    surface.style.removeProperty('clip-path');
    surface.style.removeProperty('opacity');
    content?.style.removeProperty('opacity');
  };
  const returnFocus = () => {
    const restore = () => {
      const element = source()?.element;
      // Never steal focus from another sheet opened by an action in this one.
      if (disposed && !doc.querySelector('[aria-modal="true"]') && element && !element.closest('[aria-hidden="true"], [inert]')) element.focus({ preventScroll: true });
    };
    win.requestAnimationFrame(() => win.requestAnimationFrame(restore));
  };
  const settle = () => {
    cancel(); clearDrag(); resetStyles();
    const complete = closingDone; closingDone = undefined;
    if (!isOpen) { complete?.(); returnFocus(); }
  };
  const animate = (open: boolean, reduced: boolean, done: () => void, kind: SheetMotionKind) => {
    const current = win.getComputedStyle(surface);
    const start = { transform: current.transform, clipPath: current.clipPath, opacity: current.opacity };
    const blocks = content ? detailContentBlocks(content) : [];
    // Capture each block before cancellation so a close during the reveal
    // cannot briefly expose blocks that have not appeared yet.
    const states = blocks.map((element) => {
      const css = win.getComputedStyle(element);
      return { opacity: css.opacity, transform: css.transform };
    });
    const first = !opened;
    const changedKind = opened && kind !== lastKind;
    lastKind = kind;
    blocks.forEach((element, index) => { if (!restingOpacity.has(element)) restingOpacity.set(element, states[index].opacity || '1'); });
    isOpen = open;
    closingDone = open ? undefined : done;
    surface.dataset.detailMotion = '';
    surface.dataset.sheetMotionKind = kind;
    cancel(); clearDrag(); resetStyles();
    if (reduced || typeof surface.animate !== 'function') { opened = true; settle(); return () => {}; }
    if (open && opened && !changedKind && start.transform === 'none' && start.opacity === '1') { settle(); return () => {}; }
    opened = true;
    const live = source();
    const target = detailRect(surface);
    const expanded = { ...normal, clipPath: `inset(0px round ${win.getComputedStyle(surface).borderRadius || '24px'})` };
    const pose = live && origin ? detailPose(first ? origin.rect : live.rect, target, origin.radius) : { ...normal, transform: 'translate3d(0px, 16px, 0px)', opacity: '0' };
    const returning = !open && Boolean(live && origin);
    const duration = open ? changedKind ? 180 : 280 : returning ? 420 : 240;
    const utility = kind !== 'detail';
    const token = generation;
    let valid = true;
    try {
      // The opaque surface arrives first. No detached title/time copies fly
      // across the screen; all content appears where it will be read.
      if (returning) {
        // Invert the expansion while the surface is still visible. Only blend
        // away after reaching the live origin, not throughout the contraction.
        // Starting from the sampled pose also preserves a dragged/partial sheet.
        play(surface, [
          { ...start, offset: 0, easing: returnEase },
          { ...pose, opacity: start.opacity, offset: .84, easing: 'ease-out' },
          { ...pose, opacity: '0', offset: 1 },
        ], duration, 0, 'linear');
      } else {
        play(surface, [open && first ? pose : start, open ? expanded : { ...pose, opacity: '0' }], duration);
      }
      // Compress long sequences evenly instead of clamping the item index:
      // later items must still enter one by one, never all on the same frame.
      const stagger = Math.min(utility ? 55 : revealStagger, (utility ? 280 : maxRevealSpread) / Math.max(1, blocks.length - 1));
      blocks.forEach((element, index) => {
        const from = open && (first || changedKind) ? { opacity: '0', transform: `translate3d(0px, ${utility ? 16 : 20}px, 0px)` } : states[index];
        // Separate properties share a start time, not an ancestor animation.
        // Closing cancels both tracks and samples their current combined pose.
        if (open) {
          const delay = first ? duration + index * stagger : changedKind ? index * Math.min(stagger, 35) : 0;
          play(element, [{ transform: from.transform }, { transform: normal.transform }], utility ? 560 : revealDuration, delay, revealEase);
          play(element, [{ opacity: from.opacity }, { opacity: restingOpacity.get(element) ?? '1' }], utility ? 360 : revealFadeDuration, delay, revealFadeEase);
        } else {
          play(element, [from, { opacity: '0', transform: 'translate3d(0px, 8px, 0px)' }], 160, 0, returnEase);
        }
      });
      // Never make a focused input invisible while the user starts typing.
      if (open && surface.contains(doc.activeElement) && doc.activeElement?.matches('input, textarea, [contenteditable="true"]')) { settle(); return () => {}; }
      const work = [...animations];
      void Promise.allSettled(work.map((animation) => animation.finished)).then(() => {
        if (!valid || disposed || token !== generation) return;
        if (open) { cancel(); resetStyles(); }
        else { const complete = closingDone; closingDone = undefined; complete?.(); returnFocus(); }
      });
    } catch { settle(); }
    return () => { valid = false; };
  };
  const resetDrag = () => {
    clearDrag();
    if (reduce() || typeof surface.animate !== 'function') { resetStyles(); return; }
    const from = win.getComputedStyle(surface).transform;
    cancel(); resetStyles();
    const token = generation;
    const animation = play(surface, [{ transform: from }, { transform: normal.transform }], 180);
    void animation.finished.then(() => { if (token === generation) { cancel(); resetStyles(); } }, () => {});
  };
  const down = (event: PointerEvent) => {
    if (!isOpen || drag || reduce() || win.innerWidth > 600 || !event.isPrimary || event.button !== 0) return;
    settle();
    drag = { id: event.pointerId, startY: event.clientY, y: 0, lastY: event.clientY, lastAt: event.timeStamp, velocity: 0 };
    try { handle?.setPointerCapture(event.pointerId); } catch { clearDrag(); return; }
    viewport.dataset.detailDrag = '';
    event.preventDefault();
  };
  const move = (event: PointerEvent) => {
    if (!drag || drag.id !== event.pointerId) return;
    const elapsed = event.timeStamp - drag.lastAt;
    if (elapsed > 0) drag.velocity = (event.clientY - drag.lastY) / elapsed;
    drag.lastY = event.clientY; drag.lastAt = event.timeStamp;
    drag.y = Math.max(0, event.clientY - drag.startY);
    const scale = Math.max(.94, 1 - drag.y / 4000);
    surface.style.transform = `translate3d(0px, ${drag.y}px, 0px) scale(${scale})`;
    viewport.style.setProperty('--detail-backdrop-opacity', String(Math.max(.15, 1 - drag.y / 450)));
    event.preventDefault();
  };
  const up = (event: PointerEvent) => {
    if (!drag || drag.id !== event.pointerId) return;
    const distance = Math.max(0, event.clientY - drag.startY);
    const velocity = event.timeStamp - drag.lastAt < 100 ? drag.velocity : 0;
    const dismiss = distance > Math.min(150, Math.max(96, surface.offsetHeight * .18)) || (distance > 40 && velocity > .7);
    if (dismiss) { clearDrag(); requestClose(); } else resetDrag();
  };
  const cancelled = (event: PointerEvent) => { if (drag?.id === event.pointerId) resetDrag(); };
  const detachHandle = () => {
    handle?.removeEventListener('pointerdown', down);
    handle?.removeEventListener('pointermove', move);
    handle?.removeEventListener('pointerup', up);
    handle?.removeEventListener('pointercancel', cancelled);
    handle?.removeEventListener('lostpointercapture', cancelled);
  };
  const bindHandle = () => {
    const next = surface.querySelector<HTMLElement>('[data-testid="detail-dismiss-handle"]');
    if (handle === next) return;
    detachHandle(); handle = next;
    handle?.addEventListener('pointerdown', down);
    handle?.addEventListener('pointermove', move);
    handle?.addEventListener('pointerup', up);
    handle?.addEventListener('pointercancel', cancelled);
    handle?.addEventListener('lostpointercapture', cancelled);
  };
  const resize = () => settle();
  const focusin = (event: FocusEvent) => {
    if (isOpen && animations.length && event.target instanceof win.HTMLElement && event.target.matches('input, textarea, [contenteditable="true"]')) settle();
  };
  const keydown = (event: KeyboardEvent) => {
    if (event.key === 'Tab' && isOpen && animations.length) settle();
  };
  surface.addEventListener('keydown', keydown);
  surface.addEventListener('focusin', focusin);
  win.addEventListener('resize', resize);
  win.visualViewport?.addEventListener('resize', resize);
  return {
    setOpen(open: boolean, reduced: boolean, done: () => void, kind: SheetMotionKind = 'detail') { bindHandle(); return animate(open, reduced, done, kind); },
    suspend() { isOpen = true; closingDone = undefined; settle(); delete surface.dataset.detailMotion; delete surface.dataset.sheetMotionKind; detachHandle(); handle = null; },
    dispose() { disposed = true; closingDone = undefined; cancel(); clearDrag(); resetStyles(); delete surface.dataset.detailMotion; delete surface.dataset.sheetMotionKind; detachHandle(); surface.removeEventListener('keydown', keydown); surface.removeEventListener('focusin', focusin); win.removeEventListener('resize', resize); win.visualViewport?.removeEventListener('resize', resize); },
  };
}
