import { create } from "zustand";
import type { TracerouteResult, TestStatus } from "@/lib/types";

interface TracerouteState {
  status: TestStatus;
  /** Last result — persists across page navigation until the next run. */
  result: TracerouteResult | null;

  setStatus: (status: TestStatus) => void;
  setResult: (result: TracerouteResult | null) => void;
}

export const useTracerouteStore = create<TracerouteState>((set) => ({
  status: "idle",
  result: null,
  setStatus: (status) => set({ status }),
  setResult: (result) => set({ result }),
}));
