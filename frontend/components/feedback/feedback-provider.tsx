"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";

export type ToastTone = "success" | "error" | "warning" | "info";
export interface ToastInput { title: string; description?: string; tone?: ToastTone; duration?: number; }
interface ToastRecord extends ToastInput { id: number; }
interface FeedbackContextValue { notify: (toast: ToastInput) => void; dismiss: (id: number) => void; }

const FeedbackContext = createContext<FeedbackContextValue | null>(null);
let toastSequence = 0;

export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const dismiss = useCallback((id: number) => setToasts((items) => items.filter((item) => item.id !== id)), []);
  const notify = useCallback((toast: ToastInput) => {
    const id = ++toastSequence;
    setToasts((items) => [...items.slice(-3), { ...toast, id, tone: toast.tone ?? "info" }]);
    window.setTimeout(() => dismiss(id), toast.duration ?? 4200);
  }, [dismiss]);
  const value = useMemo(() => ({ notify, dismiss }), [dismiss, notify]);
  return <FeedbackContext.Provider value={value}>{children}<ToastViewport toasts={toasts} onDismiss={dismiss} /></FeedbackContext.Provider>;
}

export function useFeedback() {
  const value = useContext(FeedbackContext);
  if (!value) throw new Error("useFeedback must be used inside FeedbackProvider");
  return value;
}

function ToastViewport({ toasts, onDismiss }: { toasts: ToastRecord[]; onDismiss: (id: number) => void }) {
  return <div className="toast-viewport" aria-live="polite" aria-label="操作反馈">{toasts.map((toast) => { const Icon = toast.tone === "success" ? CheckCircle2 : toast.tone === "error" ? XCircle : toast.tone === "warning" ? AlertTriangle : Info; return <article key={toast.id} className={`toast-card ${toast.tone}`}><Icon size={18} aria-hidden="true" /><span><strong>{toast.title}</strong>{toast.description && <small>{toast.description}</small>}</span><button type="button" aria-label="关闭反馈" onClick={() => onDismiss(toast.id)}><X size={15} /></button></article>; })}</div>;
}
