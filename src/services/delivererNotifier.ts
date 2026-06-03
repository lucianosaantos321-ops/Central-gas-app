type NotifyOptions = {
  title?: string;
  badgeCount?: number; // ex: 1..99
  vibrate?: boolean;
  sound?: boolean;
  repeat?: number; // quantas vezes
};

let lastBeepAt = 0;
let audioCtx: AudioContext | null = null;

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function setDocumentBadge(count: number) {
  const c = clamp(Number(count || 0), 0, 99);
  const base = "Central Gás";
  if (typeof document === "undefined") return;
  if (c <= 0) {
    document.title = base;
    return;
  }
  document.title = `(${c}) ${base}`;
}

function canVibrate() {
  try {
    return typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
  } catch {
    return false;
  }
}

function vibratePattern() {
  // padrão curto (não agressivo)
  try {
    navigator.vibrate?.([320, 120, 320, 120, 420, 160, 420]);
  } catch {
    // ignore
  }
}

function ensureAudioContext(): AudioContext | null {
  try {
    const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return null;
    if (!audioCtx) audioCtx = new Ctx();
    return audioCtx;
  } catch {
    return null;
  }
}

function beepOnce(freq = 2600, ms = 260, gainValue = 0.46) {
  const ctx = ensureAudioContext();
  if (!ctx) return false;

  try {
    // alguns browsers exigem gesto do usuário antes de tocar som
    if (ctx.state === "suspended") ctx.resume?.();

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "square";
    osc.frequency.value = freq;

    gain.gain.value = gainValue;

    osc.connect(gain);
    gain.connect(ctx.destination);

    const now = ctx.currentTime;
    osc.start(now);
    osc.stop(now + ms / 1000);

    return true;
  } catch {
    return false;
  }
}

function playAlertBeep(repeat = 2) {
  // rate limit de beeps para evitar spam
  const now = Date.now();
  if (now - lastBeepAt < 2500) return;

  lastBeepAt = now;

  const times = clamp(Number(repeat || 1), 1, 5);
  let i = 0;

  const seq = () => {
    i += 1;
    beepOnce(i % 2 === 0 ? 3000 : 2600, 260);
    if (i < times) setTimeout(seq, 390);
  };

  seq();
}

/**
 * Notificação operacional:
 * - badge no título da aba
 * - vibração (se suportado)
 * - beep (WebAudio) - pode falhar sem gesto do usuário (normal)
 */
export function notifyDeliverer(opts: NotifyOptions) {
  const badgeCount = Number(opts.badgeCount || 0);
  setDocumentBadge(badgeCount);

  if (opts.vibrate && canVibrate()) vibratePattern();

  if (opts.sound) playAlertBeep(opts.repeat ?? 2);
}

export function clearDelivererBadge() {
  setDocumentBadge(0);
}
