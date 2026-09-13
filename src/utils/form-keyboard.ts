// Keep the active text field just above the keyboard, within its own scroll
// container. Native date/time popovers and background sheets are left alone.
export function followFormKeyboard(getScroll: () => HTMLElement | null) {
  const visual = window.visualViewport;
  let frame = 0;
  let content: HTMLElement | null = null;
  let originalPadding = '';
  let basePadding = 0;
  let extraPadding = 0;
  let layoutHeight = document.documentElement.clientHeight;
  const reset = () => {
    if (content) content.style.paddingTop = originalPadding;
    content = null;
    extraPadding = 0;
  };
  const update = () => {
    const scroll = getScroll();
    const field = document.activeElement;
    const textField = field instanceof HTMLTextAreaElement || (field instanceof HTMLInputElement && ['text', 'search', 'email', 'url', 'tel', 'password', 'number'].includes(field.type));
    layoutHeight = Math.max(layoutHeight, document.documentElement.clientHeight);
    if (!scroll || !textField || !scroll.contains(field) || !window.matchMedia('(max-width: 600px)').matches || !visual || visual.scale !== 1 || layoutHeight - visual.height < 100) {
      reset();
      return;
    }
    const nextContent = scroll.firstElementChild as HTMLElement | null;
    if (!nextContent) return;
    if (content !== nextContent) {
      reset();
      content = nextContent;
      originalPadding = content.style.paddingTop;
      basePadding = parseFloat(getComputedStyle(content).paddingTop) || 0;
    }
    const bounds = scroll.getBoundingClientRect();
    const bottom = Math.min(bounds.bottom, visual.offsetTop + visual.height) - 12;
    // Add only the space needed to allow even the first field to sit above
    // the keyboard; restore normal spacing once the keyboard closes.
    const naturalBottom = field.getBoundingClientRect().bottom + scroll.scrollTop - extraPadding;
    extraPadding = Math.max(0, bottom - naturalBottom);
    content.style.paddingTop = `${basePadding + extraPadding}px`;
    const delta = field.getBoundingClientRect().bottom - bottom;
    if (Math.abs(delta) > 1) scroll.scrollTop += delta;
  };
  const schedule = () => {
    cancelAnimationFrame(frame);
    // Let useModalViewport apply the visible height before measuring fields.
    frame = requestAnimationFrame(() => { frame = requestAnimationFrame(update); });
  };
  const orientation = () => { layoutHeight = document.documentElement.clientHeight; schedule(); };
  document.addEventListener('focusin', schedule);
  document.addEventListener('focusout', schedule);
  visual?.addEventListener('resize', schedule);
  visual?.addEventListener('scroll', schedule);
  window.addEventListener('resize', schedule);
  window.addEventListener('orientationchange', orientation);
  schedule();
  return () => {
    cancelAnimationFrame(frame);
    reset();
    document.removeEventListener('focusin', schedule);
    document.removeEventListener('focusout', schedule);
    visual?.removeEventListener('resize', schedule);
    visual?.removeEventListener('scroll', schedule);
    window.removeEventListener('resize', schedule);
    window.removeEventListener('orientationchange', orientation);
  };
}
