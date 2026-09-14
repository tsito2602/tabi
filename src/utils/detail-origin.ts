export type DetailRect = { left: number; top: number; width: number; height: number };
export type DetailLabel = { key: 'title' | 'time' | 'time-end'; text: string; rect: DetailRect; style: Record<string, string> };
export type DetailOrigin = { element: unknown; rect: DetailRect; radius: number; labels: DetailLabel[] };

// Native sheets retain the platform presentation and dismissal behavior.
export function captureDetailOrigin(_event: { currentTarget?: unknown }): DetailOrigin | undefined { return undefined; }
