import { create } from "zustand";
import type { FileListing } from "@/lib/types";

export type FsStatus = "idle" | "loading" | "ready" | "error";
/** @deprecated use FsStatus */
export type SftpStatus = FsStatus;

interface SftpState {
  hostId: string | null;
  listing: FileListing | null;
  status: FsStatus;
  error: string | null;
  showHidden: boolean;

  setHostId: (id: string | null) => void;
  setListing: (listing: FileListing | null) => void;
  setStatus: (status: FsStatus) => void;
  setError: (error: string | null) => void;
  setShowHidden: (show: boolean) => void;
  reset: () => void;
}

export const useSftpStore = create<SftpState>((set) => ({
  hostId: null,
  listing: null,
  status: "idle",
  error: null,
  showHidden: false,

  setHostId: (hostId) => set({ hostId }),
  setListing: (listing) => set({ listing }),
  setStatus: (status) => set({ status }),
  setError: (error) => set({ error }),
  setShowHidden: (showHidden) => set({ showHidden }),
  reset: () =>
    set({ hostId: null, listing: null, status: "idle", error: null, showHidden: false }),
}));
