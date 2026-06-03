import { create } from "zustand";

export type RemoteSyncScope = "public" | "admin" | "finance";

type RemoteSyncState = {
  publicVersion: number;
  adminVersion: number;
  financeVersion: number;
  publicHydrating: boolean;
  adminHydrating: boolean;
  financeHydrating: boolean;
  publicReady: boolean;
  adminReady: boolean;
  financeReady: boolean;
  bump: (scope: RemoteSyncScope) => void;
  setHydrating: (scope: RemoteSyncScope, hydrating: boolean) => void;
  setReady: (scope: RemoteSyncScope, ready: boolean) => void;
};

export const useRemoteSyncStore = create<RemoteSyncState>((set) => ({
  publicVersion: 0,
  adminVersion: 0,
  financeVersion: 0,
  publicHydrating: false,
  adminHydrating: false,
  financeHydrating: false,
  publicReady: false,
  adminReady: false,
  financeReady: false,

  bump: (scope) =>
    set((state) => {
      if (scope === "public") {
        return { publicVersion: state.publicVersion + 1 };
      }

      if (scope === "admin") {
        return { adminVersion: state.adminVersion + 1 };
      }

      return { financeVersion: state.financeVersion + 1 };
    }),

  setHydrating: (scope, hydrating) =>
    set(() => {
      if (scope === "public") return { publicHydrating: hydrating };
      if (scope === "admin") return { adminHydrating: hydrating };
      return { financeHydrating: hydrating };
    }),

  setReady: (scope, ready) =>
    set(() => {
      if (scope === "public") return { publicReady: ready };
      if (scope === "admin") return { adminReady: ready };
      return { financeReady: ready };
    }),
}));
