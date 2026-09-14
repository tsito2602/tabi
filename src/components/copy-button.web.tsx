import * as Clipboard from 'expo-clipboard';
import { useEffect, useRef, useState } from 'react';

export function CopyButton({ value, label = 'コピー' }: { value: string; label?: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'error'>('idle');
  const busy = useRef(false);
  const active = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { active.current = true; return () => { active.current = false; if (timer.current) clearTimeout(timer.current); }; }, []);
  const copy = async () => {
    if (busy.current) return;
    busy.current = true;
    let next: 'copied' | 'error';
    try { next = await Clipboard.setStringAsync(value) ? 'copied' : 'error'; }
    catch { next = 'error'; }
    finally { busy.current = false; }
    if (!active.current) return;
    if (timer.current) clearTimeout(timer.current);
    setState(next);
    timer.current = setTimeout(() => setState('idle'), 2000);
  };
  return <button type="button" className="motion-copy" aria-label={state === 'copied' ? 'コピーしました' : state === 'error' ? 'コピーできませんでした。長押しでコピーしてください' : label} onClick={() => void copy()}>
    <span className="t-icon-swap" data-state={state === 'copied' ? 'b' : 'a'} aria-hidden="true">
      <span className="t-icon" data-icon="a" style={{ color: state === 'error' ? 'var(--danger)' : undefined }}>{state === 'error' ? '再試行' : label}</span>
      <span className="t-icon" data-icon="b" style={{ fontSize: 22, lineHeight: '26px' }}>✓</span>
    </span>
  </button>;
}
