import { useEffect, useMemo, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { subscribeRealtime } from "../services/realtimeBus";
import type { ToastVariant } from "../services/realtimeBus";

type Toast = {
  id: string;
  title: string;
  message: string;
  variant: ToastVariant;
  createdAt: number;
};

function pillColors(variant: ToastVariant) {
  switch (variant) {
    case "success":
      return {
        bg: "rgba(67,160,71,0.12)",
        bd: "rgba(67,160,71,0.24)",
        fg: "#2E7D32",
      };
    case "warning":
      return {
        bg: "rgba(251,140,0,0.12)",
        bd: "rgba(251,140,0,0.24)",
        fg: "#FB8C00",
      };
    case "error":
      return {
        bg: "rgba(229,57,53,0.12)",
        bd: "rgba(229,57,53,0.24)",
        fg: "#E53935",
      };
    default:
      return {
        bg: "rgba(30,136,229,0.12)",
        bd: "rgba(30,136,229,0.24)",
        fg: "#1E88E5",
      };
  }
}

function variantLabel(variant: ToastVariant) {
  switch (variant) {
    case "success":
      return "sucesso";
    case "warning":
      return "atenção";
    case "error":
      return "erro";
    default:
      return "info";
  }
}

function uid() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function ToastHostInner() {
  const [items, setItems] = useState<Toast[]>([]);
  const timersRef = useRef<Record<string, number>>({});

  const max = 4;
  const ttlMs = 4500;

  useEffect(() => {
    const unsub = subscribeRealtime((ev) => {
      if (ev.type !== "toast") return;

      const toast: Toast = {
        id: uid(),
        title: ev.title,
        message: ev.message,
        variant: ev.variant,
        createdAt: Date.now(),
      };

      setItems((current) => [toast, ...current].slice(0, max));

      const timeoutId = window.setTimeout(() => {
        setItems((current) => current.filter((item) => item.id !== toast.id));
        delete timersRef.current[toast.id];
      }, ttlMs);

      timersRef.current[toast.id] = timeoutId;
    });

    return () => {
      unsub();

      Object.values(timersRef.current).forEach((timeoutId) => {
        window.clearTimeout(timeoutId);
      });

      timersRef.current = {};
    };
  }, []);

  const has = items.length > 0;

  const containerStyle = useMemo(
    () => ({
      position: "fixed" as const,
      left: 0,
      right: 0,
      top: 12,
      zIndex: 10000,
      pointerEvents: "none" as const,
    }),
    []
  );

  function closeToast(id: string) {
    const timeoutId = timersRef.current[id];
    if (timeoutId) {
      window.clearTimeout(timeoutId);
      delete timersRef.current[id];
    }

    setItems((current) => current.filter((item) => item.id !== id));
  }

  return (
    <div style={containerStyle}>
      <div
        style={{
          maxWidth: 520,
          margin: "0 auto",
          padding: "0 12px",
          boxSizing: "border-box",
          display: "grid",
          gap: 10,
          opacity: has ? 1 : 0,
          transition: "opacity 180ms ease",
        }}
      >
        {items.map((toast) => {
          const colors = pillColors(toast.variant);

          return (
            <div
              key={toast.id}
              style={{
                pointerEvents: "auto",
                background: "rgba(255,255,255,0.92)",
                backdropFilter: "blur(10px)",
                borderRadius: 18,
                border: "1px solid rgba(0,0,0,0.08)",
                boxShadow: "0 14px 34px rgba(0,0,0,0.10)",
                padding: 12,
                display: "grid",
                gap: 6,
              }}
              role="status"
              aria-live="polite"
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 10,
                  alignItems: "center",
                }}
              >
                <div style={{ fontWeight: 950, color: "#111827" }}>
                  {toast.title}
                </div>

                <div
                  style={{
                    padding: "6px 10px",
                    borderRadius: 999,
                    background: colors.bg,
                    border: `1px solid ${colors.bd}`,
                    color: colors.fg,
                    fontWeight: 950,
                    fontSize: 12,
                    whiteSpace: "nowrap",
                  }}
                >
                  {variantLabel(toast.variant)}
                </div>
              </div>

              <div style={{ color: "#444", fontSize: 13, lineHeight: 1.35 }}>
                {toast.message}
              </div>

              <button
                onClick={() => closeToast(toast.id)}
                style={{
                  justifySelf: "end",
                  height: 34,
                  borderRadius: 12,
                  border: "1px solid rgba(0,0,0,0.10)",
                  background: "#fff",
                  fontWeight: 950,
                  cursor: "pointer",
                  padding: "0 12px",
                }}
                type="button"
              >
                Fechar
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function ToastHost() {
  if (Capacitor.isNativePlatform()) {
    return null;
  }

  return <ToastHostInner />;
}
