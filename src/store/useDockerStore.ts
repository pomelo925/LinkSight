import { create } from "zustand";
import { getDockerOverview } from "@/lib/api";
import type { DockerOverview } from "@/lib/types";

const EMPTY_OVERVIEW: DockerOverview = {
  containers: [],
  images: [],
  diskUsage: [],
  hostDisks: [],
};

interface DockerState {
  data: DockerOverview;
  /** True only while the first load (no cached data yet) is in flight. */
  loading: boolean;
  /** True while a background refresh is in flight. */
  refreshing: boolean;
  error: string | null;
  hasLoaded: boolean;

  load: () => Promise<void>;
  setData: (data: DockerOverview) => void;
}

/**
 * Docker overview cache — survives page navigation so remounts show the last
 * snapshot immediately, then refresh in place when new data arrives.
 */
export const useDockerStore = create<DockerState>((set, get) => ({
  data: EMPTY_OVERVIEW,
  loading: false,
  refreshing: false,
  error: null,
  hasLoaded: false,

  setData: (data) => set({ data }),

  load: async () => {
    const { hasLoaded, data } = get();
    const hasSnapshot =
      hasLoaded ||
      data.containers.length > 0 ||
      data.images.length > 0 ||
      data.diskUsage.length > 0 ||
      data.hostDisks.length > 0;

    if (hasSnapshot) {
      set({ refreshing: true, error: null });
    } else {
      set({ loading: true, error: null });
    }

    try {
      const next = await getDockerOverview();
      set({
        data: {
          ...next,
          hostDisks: next.hostDisks ?? [],
          diskUsage: next.diskUsage ?? [],
          containers: next.containers ?? [],
          images: next.images ?? [],
        },
        error: null,
        hasLoaded: true,
        loading: false,
        refreshing: false,
      });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : String(err),
        loading: false,
        refreshing: false,
        // Keep prior snapshot on refresh failure; only clear when first load fails.
        ...(hasSnapshot ? {} : { data: EMPTY_OVERVIEW }),
      });
    }
  },
}));
