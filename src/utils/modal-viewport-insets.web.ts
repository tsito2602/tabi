/** Only subtract the part of the bottom safe area outside the visual viewport.
 * Focus alone does not mean a software keyboard is open (hardware keyboards,
 * a dismissed keyboard, or an underlying editor with a nested picker).
 */
export function modalBottomOcclusion(layoutHeight: number, visual: Pick<VisualViewport, 'height' | 'offsetTop' | 'scale'> | null) {
  if (!visual || Math.abs(visual.scale - 1) > .01) return 0;
  const gap = layoutHeight - visual.height - visual.offsetTop;
  return Number.isFinite(gap) ? Math.max(0, gap) : 0;
}

/** Scoped to a mounted modal; never changes another modal's insets or focus. */
export function trackModalViewportInsets(root: HTMLElement) {
  const win = root.ownerDocument.defaultView;
  if (!win) return () => {};
  const visual = win.visualViewport;
  let frame = 0;
  const update = () => {
    frame = 0;
    root.style.setProperty('--modal-bottom-occlusion', `${modalBottomOcclusion(win.innerHeight, visual)}px`);
  };
  const schedule = () => { if (!frame) frame = win.requestAnimationFrame(update); };
  update();
  visual?.addEventListener('resize', schedule);
  visual?.addEventListener('scroll', schedule);
  win.addEventListener('resize', schedule);
  return () => {
    win.cancelAnimationFrame(frame);
    visual?.removeEventListener('resize', schedule);
    visual?.removeEventListener('scroll', schedule);
    win.removeEventListener('resize', schedule);
    root.style.removeProperty('--modal-bottom-occlusion');
  };
}
