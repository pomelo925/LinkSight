import { create } from "zustand";
import type {
  SpeedtestProgress,
  SpeedtestResult,
  TestStatus,
} from "@/lib/types";

interface SpeedtestState {
  status: TestStatus;
  /** Live progress during a run; cleared when a run finishes. */
  progress: SpeedtestProgress | null;
  /** Last result — persists across page navigation until the next run. */
  result: SpeedtestResult | null;

  setStatus: (status: TestStatus) => void;
  setProgress: (progress: SpeedtestProgress | null) => void;
  setResult: (result: SpeedtestResult | null) => void;
}

export const useSpeedtestStore = create<SpeedtestState>((set) => ({
  status: "idle",
  progress: null,
  result: null,
  setStatus: (status) => set({ status }),
  // Progress events only carry the fields of the current phase; merge with the
  // previous snapshot so earlier metrics (e.g. latency) stay visible.
  setProgress: (progress) =>
    set((s) =>
      progress === null
        ? { progress: null }
        : {
            progress: {
              ...progress,
              latencyMs: progress.latencyMs ?? s.progress?.latencyMs ?? null,
              jitterMs: progress.jitterMs ?? s.progress?.jitterMs ?? null,
              downloadMbps:
                progress.downloadMbps ?? s.progress?.downloadMbps ?? null,
              uploadMbps:
                progress.uploadMbps ?? s.progress?.uploadMbps ?? null,
            },
          },
    ),
  setResult: (result) => set({ result }),
}));
