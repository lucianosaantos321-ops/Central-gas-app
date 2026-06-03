export const CENTRAL_SUPPORT_WHATSAPP = "61992982454";

function onlyDigits(value: unknown) {
  return String(value ?? "").replace(/\D/g, "");
}

function normalizePhoneBR(raw: string) {
  const digits = onlyDigits(raw);
  if (!digits) return "";
  if (digits.startsWith("55")) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

export function formatCentralSupportPhone() {
  const digits = onlyDigits(CENTRAL_SUPPORT_WHATSAPP);
  if (digits.length !== 11) return CENTRAL_SUPPORT_WHATSAPP;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export function buildWhatsAppLink(phone: string, message: string) {
  const normalized = normalizePhoneBR(phone);
  const text = encodeURIComponent(String(message || "").trim());
  if (normalized) {
    return `https://api.whatsapp.com/send?phone=${normalized}&text=${text}`;
  }
  return `https://api.whatsapp.com/send?text=${text}`;
}

export function buildCentralSupportLink(input: {
  role: "cliente" | "entregador";
  name?: string | null;
  phone?: string | null;
  context?: string | null;
}) {
  const roleLabel = input.role === "entregador" ? "entregador" : "cliente";
  const parts = [
    `Ola, Central! Preciso de suporte no app do ${roleLabel}.`,
    input.name ? `Nome: ${String(input.name).trim()}` : "",
    input.phone ? `Telefone: ${String(input.phone).trim()}` : "",
    input.context ? `Assunto: ${String(input.context).trim()}` : "",
  ].filter(Boolean);

  return buildWhatsAppLink(CENTRAL_SUPPORT_WHATSAPP, parts.join("\n"));
}
