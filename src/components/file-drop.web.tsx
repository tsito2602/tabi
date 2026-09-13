import { useRef, useState } from 'react';
import { useDesktop } from '@/hooks/use-desktop';
import type { FileDropProps } from './file-drop';

export function FileDrop({ label, selectLabel = 'ファイルを選択', hint, accept, multiple = false, disabled = false, onFiles, children }: FileDropProps) {
  const desktop = useDesktop();
  const input = useRef<HTMLInputElement>(null);
  const depth = useRef(0);
  const locked = useRef(false);
  const [dragging, setDragging] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const submit = async (files: File[]) => {
    if (disabled || locked.current || !files.length) return;
    if (!multiple && files.length > 1) { setError('ファイルは1つずつ追加してください'); return; }
    locked.current = true; setProcessing(true); setError('');
    try { await onFiles(files); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'ファイルを追加できませんでした'); }
    finally { locked.current = false; setProcessing(false); if (input.current) input.current.value = ''; }
  };
  const unavailable = disabled || processing;
  return <div className={`file-drop${dragging ? ' is-dragging' : ''}${unavailable ? ' is-disabled' : ''}`} onDragEnter={(event) => {
    if (!event.dataTransfer.types.includes('Files')) return;
    event.preventDefault(); event.stopPropagation(); depth.current += 1; if (!unavailable) setDragging(true);
  }} onDragOver={(event) => {
    if (!event.dataTransfer.types.includes('Files')) return;
    event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = unavailable ? 'none' : 'copy';
  }} onDragLeave={(event) => { event.preventDefault(); event.stopPropagation(); depth.current = Math.max(0, depth.current - 1); if (!depth.current) setDragging(false); }} onDrop={(event) => {
    event.preventDefault(); event.stopPropagation(); depth.current = 0; setDragging(false); void submit(Array.from(event.dataTransfer.files));
  }}>
    {children}
    <input ref={input} type="file" accept={accept} multiple={multiple} disabled={unavailable} aria-label={selectLabel} style={{ display: 'none' }} onChange={(event) => void submit(Array.from(event.target.files ?? []))} />
    <button type="button" className="file-drop-button" disabled={unavailable} onClick={() => input.current?.click()}>
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M12 16V3m-5 5 5-5 5 5M4 15v5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5" /></svg>
      <strong>{processing ? 'ファイルを処理中…' : desktop ? dragging ? 'ここにドロップ' : label : selectLabel}</strong>
      <span>{hint}</span>{desktop && <span className="file-drop-select">{selectLabel}</span>}
    </button>
    {error ? <p role="alert" className="file-drop-error">{error}</p> : null}
  </div>;
}
