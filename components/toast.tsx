"use client";
import { useEffect, useState } from "react";

type Kind = "success" | "error" | "info" | "warning";
type Toast = { id: number; message: string; kind: Kind };
type Listener = (t: Toast) => void;

const listeners = new Set<Listener>();
let counter = 0;

/** Fire a transient popup from anywhere (no provider/threading needed). */
export function notify(message: string, kind: Kind = "success") {
  const toast = { id: ++counter, message, kind };
  listeners.forEach((l) => l(toast));
}

/** Mounted once near the root; renders the stack of active toasts. */
export function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const listener: Listener = (t) => {
      setToasts((prev) => [...prev, t]);
      window.setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== t.id)), 3800);
    };
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, []);

  if (!toasts.length) return null;
  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`}>
          <span className="toast-icon" aria-hidden="true" />
          <p>{t.message}</p>
          <button type="button" onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))} aria-label="Dismiss">×</button>
        </div>
      ))}
    </div>
  );
}
