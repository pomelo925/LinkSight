import { create } from "zustand";
import type { HostRecord, VerifyResult } from "@/lib/types";

type PeerVerifyStatus = "idle" | "verifying" | "ok" | "failed";

interface HomeState {
  /** Remote peer selected in the right circle (persists across navigation). */
  selectedHost: HostRecord | null;
  verifyStatus: PeerVerifyStatus;
  verifyResult: VerifyResult | null;

  selectHost: (host: HostRecord | null) => void;
  setVerify: (status: PeerVerifyStatus, result?: VerifyResult | null) => void;
}

export const useHomeStore = create<HomeState>((set) => ({
  selectedHost: null,
  verifyStatus: "idle",
  verifyResult: null,

  selectHost: (host) =>
    set({ selectedHost: host, verifyStatus: "idle", verifyResult: null }),
  setVerify: (status, result = null) =>
    set({ verifyStatus: status, verifyResult: result }),
}));
