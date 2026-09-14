import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
const ToastContext = createContext<{ show: (message: string) => void; message: string; open: boolean } | null>(null);
export const useToast = () => useContext(ToastContext)!.show;

export function ToastProvider({ children }: PropsWithChildren) {
  const [message, setMessage] = useState('');
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((next: string) => {
    if (timer.current) clearTimeout(timer.current);
    setMessage(next);
    setOpen(true);
    timer.current = setTimeout(() => setOpen(false), 3600);
  }, []);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return <ToastContext.Provider value={{ show, message, open }}>{children}<ToastHost /></ToastContext.Provider>;
}

export function ToastHost() {
  const toast = useContext(ToastContext);
  const insets = useSafeAreaInsets();
  if (!toast) return null;
  return <div className="motion-toast-position" style={{ bottom: insets.bottom + 28 }}>
    <div data-testid="toast" className={`motion-toast t-toast ${toast.open ? 'is-open' : ''}`} aria-hidden={!toast.open}>
      <span role="status" aria-live="polite">{toast.message}</span>
    </div>
  </div>;
}
