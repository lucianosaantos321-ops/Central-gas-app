import { useEffect } from "react";
import { useAuthStore } from "../store/useAuthStore";
import { useEntregadorStore } from "../store/useEntregadorStore";

export function useEffectiveEntregadorId() {
  const profileDelivererId = useAuthStore((state) => state.profile?.delivererId ?? "");
  const storeDelivererId = useEntregadorStore((state) => state.entregadorId);
  const setEntregadorId = useEntregadorStore((state) => state.setEntregadorId);

  useEffect(() => {
    const normalizedProfileId = String(profileDelivererId || "").trim();
    const normalizedStoreId = String(storeDelivererId || "").trim();

    if (!normalizedProfileId || normalizedProfileId === normalizedStoreId) {
      return;
    }

    setEntregadorId(normalizedProfileId);
  }, [profileDelivererId, setEntregadorId, storeDelivererId]);

  return String(profileDelivererId || storeDelivererId || "").trim();
}
