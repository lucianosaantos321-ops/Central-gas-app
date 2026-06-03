// src/services/addressStore.ts
import { v4 as uuid } from "uuid";
import {
  queueRemoteCurrentUserDocumentSave,
} from "./remoteUserStateService";
import {
  readLocalUserDocumentPayload,
  writeLocalUserDocumentPayload,
} from "./userStateSchemas";

export interface Address {
  id: string;
  label: string;
  street: string;
  number: string;
  neighborhood: string;
  city: string;

  complement?: string;
  reference?: string;

  // telefone/whatsapp do cliente
  phone?: string;

  // localização GPS
  lat?: number | null;
  lng?: number | null;

  createdAt: string;
  updatedAt?: string;
}

function now() {
  return new Date().toISOString();
}

function loadAddresses(): Address[] {
  if (typeof window === "undefined") return [];
  const doc = readLocalUserDocumentPayload("client_addresses") as {
    items?: Address[];
  };
  return Array.isArray(doc?.items) ? doc.items : [];
}

function saveAddresses(list: Address[]) {
  if (typeof window === "undefined") return;
  const current = readLocalUserDocumentPayload("client_addresses") as {
    primaryId?: string;
  };
  const next = {
    items: Array.isArray(list) ? list : [],
    primaryId: String(current?.primaryId ?? "").trim(),
    updatedAt: now(),
  };
  writeLocalUserDocumentPayload("client_addresses", next);
  queueRemoteCurrentUserDocumentSave("client_addresses", next);
}

function getPrimaryId(): string {
  if (typeof window === "undefined") return "";
  const doc = readLocalUserDocumentPayload("client_addresses") as {
    primaryId?: string;
  };
  return String(doc?.primaryId ?? "").trim();
}

function setPrimaryId(id: string) {
  if (typeof window === "undefined") return;
  const current = readLocalUserDocumentPayload("client_addresses") as {
    items?: Address[];
  };
  const next = {
    items: Array.isArray(current?.items) ? current.items : [],
    primaryId: id,
    updatedAt: now(),
  };
  writeLocalUserDocumentPayload("client_addresses", next);
  queueRemoteCurrentUserDocumentSave("client_addresses", next);
}

function clearPrimaryId() {
  if (typeof window === "undefined") return;
  const current = readLocalUserDocumentPayload("client_addresses") as {
    items?: Address[];
  };
  const next = {
    items: Array.isArray(current?.items) ? current.items : [],
    primaryId: "",
    updatedAt: now(),
  };
  writeLocalUserDocumentPayload("client_addresses", next);
  queueRemoteCurrentUserDocumentSave("client_addresses", next);
}

/** Leitura */
export function getAddresses(): Address[] {
  return loadAddresses();
}

export function getPrimaryAddressId(): string {
  return getPrimaryId();
}

export function getPrimaryAddress(): Address | null {
  const id = getPrimaryId();
  if (!id) return null;
  const list = loadAddresses();
  return list.find((a) => a.id === id) ?? null;
}

/** Principal */
export function setPrimaryAddress(id: string) {
  const list = loadAddresses();
  const exists = list.some((a) => a.id === id);
  if (!exists) return false;
  setPrimaryId(id);
  return true;
}

/** CRUD (persistente) */
export function createAddress(data: Omit<Address, "id" | "createdAt" | "updatedAt">): Address {
  const list = loadAddresses();

  const address: Address = {
    id: uuid(),
    createdAt: now(),
    updatedAt: now(),

    label: data.label,
    street: data.street,
    number: data.number,
    neighborhood: data.neighborhood,
    city: data.city,
    complement: data.complement,
    reference: data.reference,

    phone: data.phone,
    lat: data.lat ?? null,
    lng: data.lng ?? null,
  };

  const next = [address, ...list];
  saveAddresses(next);

  // se ainda não tem principal, marca este como principal
  if (!getPrimaryId()) setPrimaryId(address.id);

  return address;
}

export function updateAddress(
  id: string,
  data: Partial<Omit<Address, "id" | "createdAt" | "updatedAt">>
): Address | null {
  const list = loadAddresses();
  const idx = list.findIndex((a) => a.id === id);
  if (idx === -1) return null;

  const updated: Address = {
    ...list[idx],
    ...data,
    updatedAt: now(),
  };

  const next = [...list];
  next[idx] = updated;
  saveAddresses(next);

  return updated;
}

export function deleteAddress(id: string) {
  const list = loadAddresses();
  const next = list.filter((a) => a.id !== id);
  saveAddresses(next);

  // se deletou o principal, escolhe outro ou limpa
  const primary = getPrimaryId();
  if (primary === id) {
    if (next.length) setPrimaryId(next[0].id);
    else clearPrimaryId();
  }
}

export function clearAddresses() {
  saveAddresses([]);
  clearPrimaryId();
}

/**
 * ✅ API “nova” (se você quiser migrar telas depois)
 * - saveAddress: cria/atualiza dependendo se veio id
 */
export function saveAddress(
  data: Partial<Address> & Omit<Address, "id" | "createdAt"> & { id?: string | null }
): Address {
  const id = (data as any).id ? String((data as any).id) : "";
  if (id) {
    const upd = updateAddress(id, data);
    if (upd) return upd;
    // se id veio mas não existe, cria novo
  }
  return createAddress(data as any);
}
