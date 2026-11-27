import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { hu } from '../i18n/hu';

export interface ToastInput {
  message: string;
  tone?: 'info' | 'error';
  action?: { label: string; run: () => void };
  /** Ezredmásodperc; alapból 5000 (a "Visszavonás" ideje, S-20/EF3). */
  duration?: number;
}

interface Toast extends ToastInput {
  id: number;
}

const ToastContext = createContext<(t: ToastInput) => void>(() => {});

export const useToast = () => useContext(ToastContext);

function ToastItem({ toast, onClose }: { toast: Toast; onClose: (id: number) => void }) {
  const { id, duration } = toast;
  useEffect(() => {
    const timer = setTimeout(() => onClose(id), duration ?? 5000);
    return () => clearTimeout(timer);
  }, [id, duration, onClose]);
  return (
    <div
      className={`toast toast-${toast.tone ?? 'info'}`}
      role={toast.tone === 'error' ? 'alert' : 'status'}
    >
      <span>{toast.message}</span>
      {toast.action && (
        <button
          type="button"
          className="toast-action"
          onClick={() => {
            toast.action!.run();
            onClose(id);
          }}
        >
          {toast.action.label}
        </button>
      )}
      <button
        type="button"
        className="toast-close"
        aria-label={hu.toast.dismiss}
        onClick={() => onClose(id)}
      >
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      </button>
    </div>
  );
}

/** Alsó értesítések; egyszerre a legutóbbi három látszik. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const show = useCallback((t: ToastInput) => {
    const id = nextId.current++;
    setToasts((list) => [...list.slice(-2), { ...t, id }]);
  }, []);
  const close = useCallback((id: number) => setToasts((l) => l.filter((t) => t.id !== id)), []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onClose={close} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}
