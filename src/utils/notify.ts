// src/utils/notify.ts
// Notificação leve (web): som curto + vibração (quando suportado).
// Não depende de libs, não quebra em desktop sem vibração.

let lastBeepAt = 0;

export function vibrate(pattern: number | number[] = [80, 40, 80]) {
  try {
    // @ts-ignore
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      // @ts-ignore
      navigator.vibrate(pattern);
    }
  } catch {
    // ignore
  }
}

export function beep(opts?: { throttleMs?: number; volume?: number; durationMs?: number; frequency?: number }) {
  const throttleMs = opts?.throttleMs ?? 2500;
  const volume = Math.min(1, Math.max(0, opts?.volume ?? 0.08));
  const durationMs = Math.max(40, opts?.durationMs ?? 140);
  const frequency = Math.max(120, opts?.frequency ?? 880);

  const now = Date.now();
  if (now - lastBeepAt < throttleMs) return;
  lastBeepAt = now;

  try {
    const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.value = frequency;

    gain.gain.value = volume;

    osc.connect(gain);
    gain.connect(ctx.destination);

    const t0 = ctx.currentTime;
    osc.start(t0);
    osc.stop(t0 + durationMs / 1000);

    osc.onended = () => {
      try {
        ctx.close();
      } catch {
        // ignore
      }
    };
  } catch {
    // ignore
  }
}

export function notifyNewOrder() {
  // som + vibração, com throttling interno do beep
  beep({ throttleMs: 2500, volume: 0.09, durationMs: 150, frequency: 920 });
  vibrate([90, 50, 90]);
}

export function notifyClientPush() {
  beep({ throttleMs: 2500, volume: 0.08, durationMs: 130, frequency: 880 });
  vibrate([70, 35, 70]);
}
