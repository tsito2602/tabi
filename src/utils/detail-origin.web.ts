import type { DetailLabel, DetailOrigin, DetailRect } from './detail-origin';
export type { DetailOrigin } from './detail-origin';

export function detailRect(element: Element): DetailRect {
  const { left, top, width, height } = element.getBoundingClientRect();
  return { left, top, width, height };
}
export function labelStyle(element: Element): Record<string, string> {
  const css = element.ownerDocument.defaultView!.getComputedStyle(element);
  return Object.fromEntries(['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'lineHeight', 'letterSpacing', 'color', 'textAlign'].map((key) => [key, css[key as keyof CSSStyleDeclaration] as string]));
}
export function captureDetailOrigin(event: { currentTarget?: unknown }): DetailOrigin | undefined {
  const element = event.currentTarget;
  if (!(element instanceof HTMLElement)) return;
  const rect = detailRect(element);
  if (!rect.width || !rect.height) return;
  const labels: DetailLabel[] = [];
  for (const key of ['title', 'time', 'time-end'] as const) {
    const label = element.querySelector<HTMLElement>(`[data-testid="detail-source-${key}"]`);
    if (label?.textContent?.trim()) labels.push({ key, text: label.textContent.trim(), rect: detailRect(label), style: labelStyle(label) });
  }
  return { element, rect, radius: parseFloat(getComputedStyle(element).borderTopLeftRadius) || 12, labels };
}
