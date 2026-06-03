import type { CSSProperties } from "react";

export const ui = {
  radius: {
    card: 18,
    section: 22,
    hero: 22,
    button: 18,
    pill: 999,
  },
  shadow: {
    soft: "0 10px 24px rgba(15,23,42,0.06)",
    medium: "0 14px 30px rgba(15,23,42,0.08)",
    orange: "0 12px 26px rgba(228,79,42,0.18)",
    dark: "0 18px 34px rgba(15,23,42,0.18)",
  },
  color: {
    bg: "#F5F7FB",
    surface: "#FFFFFF",
    surfaceMuted: "#F8FAFC",
    border: "rgba(15,23,42,0.08)",
    borderStrong: "rgba(228,79,42,0.18)",
    text: "#111827",
    textSoft: "#334155",
    textMuted: "#64748B",
    primary: "#E44F2A",
    primaryStrong: "#C2410C",
    primaryGradient: "linear-gradient(135deg,#F15A2B 0%, #FFA300 100%)",
    darkGradient: "linear-gradient(135deg,#0F172A 0%, #111827 100%)",
    dangerBg: "rgba(185,28,28,0.08)",
    dangerBorder: "rgba(185,28,28,0.16)",
    dangerText: "#991B1B",
  },
} as const;

export function cardStyle(overrides?: CSSProperties): CSSProperties {
  return {
    background: ui.color.surface,
    borderRadius: ui.radius.card,
    padding: 16,
    border: `1px solid ${ui.color.border}`,
    boxShadow: ui.shadow.soft,
    ...overrides,
  };
}

export function sectionCardStyle(overrides?: CSSProperties): CSSProperties {
  return cardStyle({
    borderRadius: ui.radius.section,
    padding: 18,
    ...overrides,
  });
}

export function primaryButtonStyle(overrides?: CSSProperties): CSSProperties {
  return {
    minHeight: 48,
    borderRadius: ui.radius.button,
    border: "none",
    background: ui.color.primaryGradient,
    color: "#fff",
    fontWeight: 900,
    cursor: "pointer",
    boxShadow: ui.shadow.orange,
    ...overrides,
  };
}

export function secondaryButtonStyle(overrides?: CSSProperties): CSSProperties {
  return {
    minHeight: 46,
    borderRadius: ui.radius.button,
    border: `1px solid ${ui.color.borderStrong}`,
    background: "rgba(255,247,237,0.96)",
    color: ui.color.primary,
    fontWeight: 900,
    cursor: "pointer",
    boxShadow: "0 6px 16px rgba(15,23,42,0.04)",
    ...overrides,
  };
}

export function dangerButtonStyle(overrides?: CSSProperties): CSSProperties {
  return {
    minHeight: 46,
    borderRadius: ui.radius.button,
    border: `1px solid ${ui.color.dangerBorder}`,
    background: ui.color.dangerBg,
    color: ui.color.dangerText,
    fontWeight: 900,
    cursor: "pointer",
    ...overrides,
  };
}

export const typography = {
  title: {
    fontSize: 18,
    fontWeight: 950,
    color: ui.color.text,
    letterSpacing: -0.2,
  } satisfies CSSProperties,
  subtitle: {
    fontSize: 13,
    color: ui.color.textMuted,
    lineHeight: 1.5,
    fontWeight: 700,
  } satisfies CSSProperties,
  muted: {
    fontSize: 12.5,
    color: ui.color.textMuted,
    lineHeight: 1.45,
  } satisfies CSSProperties,
  sectionLabel: {
    fontSize: 12,
    fontWeight: 900,
    color: ui.color.textMuted,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
  } satisfies CSSProperties,
};
