import { create } from "zustand";
import type { NetworkTestResult, TestStatus } from "@/lib/types";

interface TestState {
  /** Live status of the active test (drives idle→running→analyzing→result UI). */
  status: TestStatus;
  /** Most recent completed result. */
  current: NetworkTestResult | null;
  /** History of completed results (newest first). */
  history: NetworkTestResult[];

  setStatus: (status: TestStatus) => void;
  pushResult: (result: NetworkTestResult) => void;
  clearHistory: () => void;
}

export const useTestStore = create<TestState>((set) => ({
  status: "idle",
  current: null,
  history: [],

  setStatus: (status) => set({ status }),
  pushResult: (result) =>
    set((state) => ({
      current: result,
      status: result.status,
      history: [result, ...state.history].slice(0, 50),
    })),
  clearHistory: () => set({ history: [], current: null, status: "idle" }),
}));
