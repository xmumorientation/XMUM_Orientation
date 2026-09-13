"use client";

import { CheckCircle2, CircleAlert, Info, X } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

type ToastTone = "success" | "error" | "info";

interface ToastInput {
  message: string;
  tone?: ToastTone;
  durationMs?: number;
}

interface ToastItem extends Required<ToastInput> {
  id: number;
}

const ToastContext = createContext<((toast: ToastInput) => void) | null>(null);

export function Toast({
  message,
  tone = "info",
  onDismiss,
}: {
  message: string;
  tone?: ToastTone;
  onDismiss?: () => void;
}) {
  const Icon = tone === "success" ? CheckCircle2 : tone === "error" ? CircleAlert : Info;
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className="pointer-events-auto flex items-center gap-3 rounded-2xl border border-paper-200 bg-white px-4 py-3 text-sm font-semibold text-ink shadow-raised"
    >
      <Icon className={tone === "error" ? "text-status-busy" : "text-brand-1"} size={20} />
      <p className="min-w-0 flex-1">{message}</p>
      {onDismiss && (
        <button onClick={onDismiss} aria-label="Dismiss notification" className="flex h-11 w-11 items-center justify-center rounded-xl text-ink-faint hover:bg-paper-100">
          <X size={18} />
        </button>
      )}
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const nextId = useRef(0);
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => {
    setItems((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const show = useCallback((input: ToastInput) => {
    const item: ToastItem = {
      id: ++nextId.current,
      message: input.message,
      tone: input.tone ?? "info",
      durationMs: input.durationMs ?? 4000,
    };
    setItems((current) => [...current.slice(-2), item]);
    window.setTimeout(() => dismiss(item.id), item.durationMs);
  }, [dismiss]);

  const value = useMemo(() => show, [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-relevant="additions"
        className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+4.75rem)] z-[80] mx-auto flex max-w-lg flex-col gap-2 px-3"
      >
        {items.map((toast) => (
          <Toast
            key={toast.id}
            message={toast.message}
            tone={toast.tone}
            onDismiss={() => dismiss(toast.id)}
          />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const show = useContext(ToastContext);
  if (!show) throw new Error("useToast must be used inside ToastProvider");
  return show;
}
