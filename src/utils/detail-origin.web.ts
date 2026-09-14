import type { DetailOrigin, DetailRect } from './detail-origin';
export type { DetailOrigin } from './detail-origin';

export function detailRect(element: Element): DetailRect {
  const { left, top, width, height } = element.getBoundingClientRect();
  return { left, top, width, height };
}
// The surface carries the relationship; content is revealed in its final layout.
export function captureDetailOrigin(event: { currentTarget?: unknown }): DetailOrigin | undefined {
  const element = event.currentTarget;
  if (!(element instanceof HTMLElement)) return;
  const rect = detailRect(element);
  if (!rect.width || !rect.height) return;
  return { element, rect, radius: parseFloat(getComputedStyle(element).borderTopLeftRadius) || 12 };
}
