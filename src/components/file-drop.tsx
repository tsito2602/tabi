import { PropsWithChildren } from 'react';
export type DroppedFile = { name: string; type: string; size: number; arrayBuffer: () => Promise<ArrayBuffer> };
export type FileDropProps = PropsWithChildren<{ label: string; selectLabel?: string; hint: string; accept: string; multiple?: boolean; disabled?: boolean; onFiles: (files: DroppedFile[]) => void | Promise<void> }>;
export function FileDrop({ children }: FileDropProps) { return children; }
