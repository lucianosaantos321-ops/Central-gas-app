// src/utils/delivererHelpers.ts

export function money(v: number) {
  if (!Number.isFinite(v)) return "R$ 0,00";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function safeText(v: any) {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

export function onlyDigits(s: string) {
  return (s || "").replace(/\D/g, "");
}

export function formatPhoneBR(raw: string) {
  const d = onlyDigits(raw).slice(0, 13); // pode vir com 55
  if (!d) return "";
  const digits = d.startsWith("55") ? d.slice(2) : d;

  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
}

export function normalizePhoneBR(raw: string) {
  const digits = onlyDigits(raw);
  if (!digits) return "";
  if (digits.startsWith("55")) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

export function buildTelLink(raw: string) {
  const d = onlyDigits(raw);
  if (!d) return "";
  const normalized = normalizePhoneBR(d);
  if (!normalized) return "";
  return `tel:+${normalized}`;
}

export function statusLabel(status?: string) {
  switch (status) {
    case "criado":
      return "Criado";
    case "confirmado":
      return "Confirmado";
    case "preparando":
      return "Preparando";
    case "saiu_para_entrega":
      return "A caminho";
    case "entregue":
      return "Entregue";
    default:
      return status ? String(status) : "—";
  }
}

export function statusPill(status?: string) {
  switch (status) {
    case "criado":
      return { bg: "rgba(17,24,39,0.07)", bd: "rgba(17,24,39,0.14)", fg: "#111827" };
    case "confirmado":
      return { bg: "rgba(30,136,229,0.10)", bd: "rgba(30,136,229,0.22)", fg: "#1E88E5" };
    case "preparando":
      return { bg: "rgba(251,140,0,0.10)", bd: "rgba(251,140,0,0.24)", fg: "#FB8C00" };
    case "saiu_para_entrega":
      return { bg: "rgba(142,36,170,0.10)", bd: "rgba(142,36,170,0.24)", fg: "#8E24AA" };
    case "entregue":
      return { bg: "rgba(67,160,71,0.10)", bd: "rgba(67,160,71,0.24)", fg: "#43A047" };
    default:
      return { bg: "rgba(17,24,39,0.07)", bd: "rgba(17,24,39,0.14)", fg: "#111827" };
  }
}

export function buildWhatsAppLink(phone: string, message: string) {
  const p = normalizePhoneBR(phone);
  const text = encodeURIComponent(message);
  if (p) return `https://api.whatsapp.com/send?phone=${p}&text=${text}`;
  return `https://api.whatsapp.com/send?text=${text}`;
}

export function buildMapsSearchLink(query: string) {
  const q = encodeURIComponent(query);
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}

export function buildMapsDirectionsLink(lat: number, lng: number) {
  const q = encodeURIComponent(`${lat},${lng}`);
  return `https://www.google.com/maps/dir/?api=1&destination=${q}`;
}

export function buildWazeDirectionsLink(lat: number, lng: number) {
  return `https://waze.com/ul?ll=${encodeURIComponent(`${lat},${lng}`)}&navigate=yes`;
}

export function buildWazeSearchLink(query: string) {
  return `https://waze.com/ul?q=${encodeURIComponent(query)}&navigate=yes`;
}

export function extractGeoLinkFromObs(obs: string) {
  const t = safeText(obs);
  if (!t) return "";
  const line = t
    .split("\n")
    .map((s) => s.trim())
    .find((s) => /localiza/i.test(s) && /maps/i.test(s) && /http/i.test(s));
  if (line) {
    const idx = line.indexOf("http");
    if (idx >= 0) return line.slice(idx).trim();
  }
  const m = t.match(/https?:\/\/\S+/i);
  return m?.[0]?.trim() ?? "";
}

export function getTime(p: any) {
  const t1 = typeof p?.updatedAt === "number" ? p.updatedAt : Date.parse(p?.updatedAt ?? "");
  const t2 = typeof p?.createdAt === "number" ? p.createdAt : Date.parse(p?.createdAt ?? "");
  const t = Number.isFinite(t1) ? t1 : Number.isFinite(t2) ? t2 : 0;
  return Number.isFinite(t) ? t : 0;
}

export function isNewPedido(p: any, minutes = 8) {
  const t = getTime(p);
  if (!t) return false;
  const ageMs = Date.now() - t;
  return ageMs >= 0 && ageMs <= minutes * 60_000;
}