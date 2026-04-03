import { createContext, useContext, useMemo } from "react";
import type { ReactNode } from "react";
import { emitToast } from "../services/realtimeBus";
import type { ToastVariant } from "../services/realtimeBus";

type ToastContextType = {
  show: (title: string, message?: string, variant?: ToastVariant) => void;
};

const ToastContext = createContext<ToastContextType | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const value = useMemo<ToastContextType>(
    () => ({
      show: (title: string, message = "", variant: ToastVariant = "info") => {
        emitToast(title, message, variant);
      },
    }),
    []
  );

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}

export function useToast() {
  const ctx = useContext(ToastContext);

  if (!ctx) {
    throw new Error("useToast must be used inside ToastProvider");
  }

  return ctx;
}