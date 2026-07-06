import { create } from "zustand";
import type {
  ConnectivityProgress,
  ConnectivityResult,
  TestStatus,
} from "@/lib/types";

interface ConnectivityState {
  status: TestStatus;
  /** Live progress during a run; cleared when a run finishes. */
  progress: ConnectivityProgress | null;
  /** Last result — persists across navigation until the next run. */
  result: ConnectivityResult | null;
  /** Host id the current result/progress belongs to (guards stale display). */
  hostId: string | null;

  setStatus: (status: TestStatus) => void;
  setProgress: (progress: ConnectivityProgress | null) => void;
  setResult: (result: ConnectivityResult | null) => void;
  setHostId: (id: string | null) => void;
  reset: () => void;
}

/** Fields carried metric-by-metric that should persist across phase events. */
const MERGE_KEYS = [
  "rttMinMs",
  "rttAvgMs",
  "rttMaxMs",
  "delayMs",
  "jitterMs",
  "packetLossPct",
  "maxPayloadBytes",
  "pathMtuBytes",
  "hops",
  "handshakeMs",
  "uplinkMbps",
  "downlinkMbps",
  "bdpBytes",
] as const;

export const useConnectivityStore = create<ConnectivityState>((set) => ({
  status: "idle",
  progress: null,
  result: null,
  hostId: null,

  setStatus: (status) => set({ status }),
  // Progress events only carry the current phase's metrics; merge with the
  // previous snapshot so earlier metrics stay visible in the grid.
  setProgress: (progress) =>
    set((s) => {
      if (progress === null) return { progress: null };
      const prev = s.progress;
      const merged = { ...progress } as ConnectivityProgress;
      if (prev) {
        for (const k of MERGE_KEYS) {
          if (merged[k] == null && prev[k] != null) {
            (merged[k] as number | null) = prev[k];
          }
        }
      }
      return { progress: merged };
    }),
  setResult: (result) => set({ result }),
  setHostId: (id) => set({ hostId: id }),
  reset: () =>
    set({ status: "idle", progress: null, result: null, hostId: null }),
}));
