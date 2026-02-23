import * as React from "react";

export type ToastAction = {
  title: string;
  description?: string;
  variant?: "default" | "destructive";
};

export type Toast = ToastAction & { id: string };

type ToastContextValue = {
  toasts: Toast[];
  toast: (action: ToastAction) => void;
  dismiss: (id: string) => void;
};

const ToastContext = React.createContext<ToastContextValue | null>(null);

export function ToasterProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);

  const toast = React.useCallback((action: ToastAction) => {
    const id = String(Date.now());
    setToasts((prev) => [...prev, { ...action, id }]);
  }, []);

  const dismiss = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const value = React.useMemo(
    () => ({ toasts, toast, dismiss }),
    [toasts, toast, dismiss]
  );

  return React.createElement(ToastContext.Provider, { value }, children);
}

export function useToast() {
  const ctx = React.useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within ToasterProvider");
  }
  return { toast: ctx.toast, toasts: ctx.toasts, dismiss: ctx.dismiss };
}
