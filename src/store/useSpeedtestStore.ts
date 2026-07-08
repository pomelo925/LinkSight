import { create } from "zustand";
import type {
  SpeedtestProgress,
  SpeedtestResult,
  TestStatus,
} from "@/lib/types";

interface SpeedtestState {
  status: TestStatus;
  progress: SpeedtestProgress | null;
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
  setProgress: (progress) =>
    set((s) => {
      if (progress === null) return { progress: null };

      // Keep the latest backend headline; never let a trailing 0.0 sample
      // wipe a valid throughput already shown.
      const pickMbps = (incoming: number | null | undefined, prev: number | null | undefined) => {
        if (incoming == null) return prev ?? null;
        if (incoming <= 0) return prev != null && prev > 0 ? prev : null;
        // Keep the live peak while a direction is still ramping up.
        if (prev != null && prev > incoming) return prev;
        return incoming;
      };

      const merged: SpeedtestProgress = {
        ...progress,
        latencyMs: progress.latencyMs ?? s.progress?.latencyMs ?? null,
        jitterMs: progress.jitterMs ?? s.progress?.jitterMs ?? null,
        downloadMbps: pickMbps(progress.downloadMbps, s.progress?.downloadMbps),
        uploadMbps: pickMbps(progress.uploadMbps, s.progress?.uploadMbps),
        downloadLatencyMs:
          progress.downloadLatencyMs ?? s.progress?.downloadLatencyMs ?? null,
        uploadLatencyMs:
          progress.uploadLatencyMs ?? s.progress?.uploadLatencyMs ?? null,
        downloadJitterMs:
          progress.downloadJitterMs ?? s.progress?.downloadJitterMs ?? null,
        uploadJitterMs:
          progress.uploadJitterMs ?? s.progress?.uploadJitterMs ?? null,
      };

      return { progress: merged };
    }),
  setResult: (result) => set({ result }),
}));
