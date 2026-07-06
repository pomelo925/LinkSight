import { create } from "zustand";
import type { FileListing } from "@/lib/types";

export type FsStatus = "idle" | "loading" | "ready" | "error";

interface LocalFsState {
  listing: FileListing | null;
  status: FsStatus;
  error: string | null;
  showHidden: boolean;

  setListing: (listing: FileListing | null) => void;
  setStatus: (status: FsStatus) => void;
  setError: (error: string | null) => void;
  setShowHidden: (show: boolean) => void;
}

export const useLocalFsStore = create<LocalFsState>((set) => ({
  listing: null,
  status: "idle",
  error: null,
  showHidden: false,

  setListing: (listing) => set({ listing }),
  setStatus: (status) => set({ status }),
  setError: (error) => set({ error }),
  setShowHidden: (showHidden) => set({ showHidden }),
}));
