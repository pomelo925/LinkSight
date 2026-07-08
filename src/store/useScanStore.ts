import { create } from "zustand";
import type { ScanResult, TestStatus } from "@/lib/types";

interface ScanState {
  status: TestStatus;
  /** Last scan result — persists across page navigation until the next scan. */
  result: ScanResult | null;
  /** CIDR used for the most recent scan (empty = auto-detect). */
  lastCidr: string;

  setStatus: (status: TestStatus) => void;
  setResult: (result: ScanResult | null) => void;
  setLastCidr: (cidr: string) => void;
}

export const useScanStore = create<ScanState>((set) => ({
  status: "idle",
  result: null,
  lastCidr: "",
  setStatus: (status) => set({ status }),
  setResult: (result) => set({ result }),
  setLastCidr: (lastCidr) => set({ lastCidr }),
}));
