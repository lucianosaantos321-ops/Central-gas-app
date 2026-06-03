import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

type Props = {
  label: string;
  color?: "orange" | "green" | "red" | "dark";
  disabled?: boolean;
  onComplete: () => void;
};

const COLOR_MAP = {
  orange: {
    track: "linear-gradient(90deg,#E44F2A,#F59E0B)",
    knob: "#FFFFFF",
    text: "#FFFFFF",
    glow: "rgba(228,79,42,0.28)",
  },
  green: {
    track: "linear-gradient(90deg,#16A34A,#22C55E)",
    knob: "#FFFFFF",
    text: "#FFFFFF",
    glow: "rgba(34,197,94,0.24)",
  },
  red: {
    track: "linear-gradient(90deg,#B91C1C,#EF4444)",
    knob: "#FFFFFF",
    text: "#FFFFFF",
    glow: "rgba(239,68,68,0.24)",
  },
  dark: {
    track: "linear-gradient(90deg,#111827,#374151)",
    knob: "#FFFFFF",
    text: "#FFFFFF",
    glow: "rgba(17,24,39,0.24)",
  },
} as const;

export default function SlideAction({
  label,
  color = "orange",
  disabled = false,
  onComplete,
}: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [x, setX] = useState(0);
  const [completed, setCompleted] = useState(false);

  const colors = useMemo(() => COLOR_MAP[color], [color]);

  useEffect(() => {
    if (!dragging) return;

    function handleMouseMove(e: MouseEvent) {
      updatePosition(e.clientX);
    }

    function handleMouseUp() {
      finishDrag();
    }

    function handleTouchMove(e: TouchEvent) {
      if (!e.touches[0]) return;
      updatePosition(e.touches[0].clientX);
    }

    function handleTouchEnd() {
      finishDrag();
    }

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    window.addEventListener("touchmove", handleTouchMove, { passive: true });
    window.addEventListener("touchend", handleTouchEnd);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
    };
  }, [dragging]);

  function getMaxX() {
    const el = ref.current;
    if (!el) return 0;
    return Math.max(0, el.clientWidth - 56);
  }

  function updatePosition(clientX: number) {
    const el = ref.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const knobHalf = 28;
    const raw = clientX - rect.left - knobHalf;
    const maxX = getMaxX();
    const clamped = Math.max(0, Math.min(maxX, raw));
    setX(clamped);
  }

  function startDrag(clientX: number) {
    if (disabled || completed) return;
    setDragging(true);
    updatePosition(clientX);
  }

  function finishDrag() {
    if (!dragging) return;
    setDragging(false);

    const maxX = getMaxX();
    const ratio = maxX > 0 ? x / maxX : 0;

    if (ratio >= 0.82) {
      setCompleted(true);
      setX(maxX);
      window.setTimeout(() => {
        onComplete();
        setCompleted(false);
        setX(0);
      }, 120);
      return;
    }

    setX(0);
  }

  return (
    <div
      ref={ref}
      style={{
        ...track,
        background: colors.track,
        opacity: disabled ? 0.55 : 1,
        cursor: disabled ? "not-allowed" : dragging ? "grabbing" : "pointer",
        boxShadow: `0 12px 28px ${colors.glow}`,
      }}
      onMouseDown={(e) => startDrag(e.clientX)}
      onTouchStart={(e) => {
        if (!e.touches[0]) return;
        startDrag(e.touches[0].clientX);
      }}
    >
      <div
        style={{
          ...fill,
          width: `${x + 56}px`,
          opacity: x > 0 ? 0.18 : 0,
        }}
      />

      <div
        style={{
          ...labelStyle,
          color: colors.text,
          opacity: completed ? 1 : 0.96,
        }}
      >
        {completed ? "Confirmado" : label}
      </div>

      <div
        style={{
          ...knob,
          transform: `translateX(${x}px)`,
          transition: dragging ? "none" : "transform 0.2s ease",
          background: colors.knob,
        }}
      >
        →
      </div>
    </div>
  );
}

const track: CSSProperties = {
  position: "relative",
  width: "100%",
  height: 56,
  borderRadius: 20,
  overflow: "hidden",
  userSelect: "none",
  WebkitUserSelect: "none",
};

const fill: CSSProperties = {
  position: "absolute",
  top: 0,
  bottom: 0,
  left: 0,
  borderRadius: 20,
  background: "#FFFFFF",
  transition: "width 0.08s linear",
};

const labelStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontWeight: 950,
  fontSize: 15,
  letterSpacing: -0.2,
  pointerEvents: "none",
};

const knob: CSSProperties = {
  position: "absolute",
  top: 4,
  left: 4,
  width: 48,
  height: 48,
  borderRadius: 16,
  display: "grid",
  placeItems: "center",
  fontSize: 28,
  fontWeight: 900,
  color: "#111827",
  boxShadow: "0 8px 18px rgba(0,0,0,0.18)",
};
