import { create } from "zustand";
import type { ScanResult, TestStatus } from "@/lib/types";

interface ScanState {
  status: TestStatus;
  /** Last scan result — persists across page navigation until the next scan. */
  result: ScanResult | null;

  setStatus: (status: TestStatus) => void;
  setResult: (result: ScanResult | null) => void;
}

export const useScanStore = create<ScanState>((set) => ({
  status: "idle",
  result: null,
  setStatus: (status) => set({ status }),
  setResult: (result) => set({ result }),
}));
