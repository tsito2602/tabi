export type DetailRect = { left: number; top: number; width: number; height: number };
export type DetailOrigin = { element: unknown; rect: DetailRect; radius: number };

// Native sheets retain the platform presentation and dismissal behavior.
export function captureDetailOrigin(_event: { currentTarget?: unknown }): DetailOrigin | undefined { return undefined; }
