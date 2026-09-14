import type { DetailOrigin, DetailRect } from './detail-origin';
import { detailRect, labelStyle } from './detail-origin.web';

const ease = 'cubic-bezier(.22, 1, .36, 1)';
const normal = { transform: 'translate3d(0px, 0px, 0px)', clipPath: 'inset(0px)', opacity: '1' };
export function detailPose(from: DetailRect, to: DetailRect, radius: number) {
  const scale = Math.max(1, from.width / to.width, from.height / to.height);
  const y = Math.max(0, (to.height - from.height / scale) / 2), x = Math.max(0, (to.width - from.width / scale) / 2);
  return { transform: `translate3d(${from.left + from.width / 2 - to.left - to.width / 2}px, ${from.top + from.height / 2 - to.top - to.height / 2}px, 0px)${scale > 1 ? ` scale(${scale})` : ''}`, clipPath: `inset(${y}px ${x}px round ${radius}px)`, opacity: '1' };
}

/** Owns one mounted detail surface. CSS still owns layout and the backdrop. */
export function createDetailMotion(surface: HTMLElement, viewport: HTMLElement, origin: DetailOrigin | undefined, requestClose: () => void) {
  const doc = surface.ownerDocument, win = doc.defaultView!;
  const content = surface.querySelector<HTMLElement>('[data-testid="form-sheet-fill"]');
  let animations: Animation[] = [], labels: HTMLElement[] = [], restoreLabels: (() => void)[] = [];
  let generation = 0, opened = false, isOpen = false, disposed = false;
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
  const removeLabels = () => {
    restoreLabels.splice(0).forEach((restore) => restore());
    labels.splice(0).forEach((label) => label.remove());
  };
  const cancel = () => {
    generation++;
    animations.splice(0).forEach((animation) => animation.cancel());
    removeLabels();
  };
  const play = (element: HTMLElement, frames: Keyframe[], duration: number, delay = 0) => {
    const animation = element.animate(frames, { duration, delay, easing: ease, fill: 'both' });
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
  const sharedLabels = (opening: boolean, duration: number) => {
    const live = source();
    if (!live || !origin) return;
    for (const entry of origin.labels) {
      const target = Array.from(surface.querySelectorAll<HTMLElement>(`[data-testid="detail-target-${entry.key}"]`)).find((element) => element.textContent?.trim() === entry.text);
      const currentSource = live.element.querySelector<HTMLElement>(`[data-testid="detail-source-${entry.key}"]`);
      if (!target || !currentSource || currentSource.textContent?.trim() !== entry.text) continue;
      const targetRect = detailRect(target), sourceRect = opening ? entry.rect : detailRect(currentSource);
      const sheetRect = surface.getBoundingClientRect();
      if (!targetRect.width || targetRect.top < sheetRect.top || targetRect.top + targetRect.height > sheetRect.bottom) continue;
      const from = opening ? sourceRect : targetRect, to = opening ? targetRect : sourceRect;
      const fromStyle = opening ? entry.style : labelStyle(target), toStyle = opening ? labelStyle(target) : labelStyle(currentSource);
      const label = doc.createElement('div');
      label.className = 'detail-motion-label';
      label.setAttribute('aria-hidden', 'true');
      label.textContent = entry.text;
      Object.assign(label.style, fromStyle, { left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${from.height}px` });
      viewport.appendChild(label); labels.push(label);
      const previous = target.style.visibility;
      target.style.visibility = 'hidden';
      restoreLabels.push(() => { target.style.visibility = previous; });
      play(label, [
        { ...fromStyle, width: `${from.width}px`, height: `${from.height}px`, transform: 'translate(0px, 0px)', opacity: 1 },
        { ...toStyle, width: `${to.width}px`, height: `${to.height}px`, transform: `translate(${to.left - from.left}px, ${to.top - from.top}px)`, opacity: 1 },
      ], duration);
    }
  };
  const settle = () => {
    cancel(); clearDrag(); resetStyles();
    const complete = closingDone; closingDone = undefined;
    if (!isOpen) { complete?.(); returnFocus(); }
  };
  const animate = (open: boolean, reduced: boolean, done: () => void) => {
    const interrupted = animations.length > 0 || Boolean(surface.style.transform);
    const current = win.getComputedStyle(surface);
    const start = { transform: current.transform, clipPath: current.clipPath, opacity: current.opacity };
    const contentOpacity = content ? win.getComputedStyle(content).opacity : '1';
    const first = !opened;
    isOpen = open;
    closingDone = open ? undefined : done;
    surface.dataset.detailMotion = '';
    cancel(); clearDrag(); resetStyles();
    if (reduced || typeof surface.animate !== 'function') { opened = true; settle(); return () => {}; }
    if (open && opened && start.transform === 'none' && start.opacity === '1') { settle(); return () => {}; }
    opened = true;
    const live = source();
    const target = detailRect(surface);
    const expanded = { ...normal, clipPath: `inset(0px round ${win.getComputedStyle(surface).borderRadius || '24px'})` };
    const pose = live && origin ? detailPose(first ? origin.rect : live.rect, target, origin.radius) : { ...normal, transform: 'translate3d(0px, 16px, 0px)', opacity: '0' };
    const duration = open ? 360 : 260;
    const token = generation;
    let valid = true;
    try {
      // Measure labels before transforming their ancestor. The real content is
      // faded separately, preventing stretched glyphs and a final-frame pop.
      if (!interrupted) sharedLabels(open, duration);
      play(surface, [open && first ? pose : start, open ? expanded : { ...pose, opacity: '0' }], duration);
      if (content) play(content, open ? [{ opacity: first ? 0 : contentOpacity }, { opacity: 1 }] : [{ opacity: contentOpacity }, { opacity: 0 }], open ? 230 : 150, open && first ? 90 : 0);
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
  win.addEventListener('resize', resize);
  win.visualViewport?.addEventListener('resize', resize);
  return {
    setOpen(open: boolean, reduced: boolean, done: () => void) { bindHandle(); return animate(open, reduced, done); },
    suspend() { isOpen = true; closingDone = undefined; settle(); delete surface.dataset.detailMotion; detachHandle(); handle = null; },
    dispose() { disposed = true; closingDone = undefined; cancel(); clearDrag(); resetStyles(); delete surface.dataset.detailMotion; detachHandle(); win.removeEventListener('resize', resize); win.visualViewport?.removeEventListener('resize', resize); },
  };
}
