import { create } from "zustand";
import { getDockerContainersLive, getDockerOverview } from "@/lib/api";
import type { DockerContainer, DockerOverview, HostRecord } from "@/lib/types";

const EMPTY_OVERVIEW: DockerOverview = {
  containers: [],
  images: [],
  diskUsage: [],
  hostDisks: [],
};

/** Poll interval for live container status + stats (matches VS Code–like feel). */
export const DOCKER_LIVE_POLL_MS = 500;

interface DockerState {
  data: DockerOverview;
  /** True only while the first load (no cached data yet) is in flight. */
  loading: boolean;
  /** True while a background refresh is in flight. */
  refreshing: boolean;
  error: string | null;
  hasLoaded: boolean;
  /** `null` = local host 127.0.0.1 */
  selectedHost: HostRecord | null;
  /** Cache key for the last successful load (`local` or host id). */
  loadedKey: string | null;

  setSelectedHost: (host: HostRecord | null) => void;
  load: (host?: HostRecord | null) => Promise<void>;
  /** Quiet high-frequency update of containers + stats only. */
  pollLive: (host?: HostRecord | null) => Promise<void>;
  setData: (data: DockerOverview) => void;
}

function hostKey(host: HostRecord | null | undefined): string {
  return host?.id ?? "local";
}

function hostAuth(host: HostRecord | null | undefined) {
  if (!host) return undefined;
  return {
    ip: host.ip,
    port: host.port,
    username: host.username,
    authMode: (host.authMode ?? "ssh") as "ssh" | "password",
    password: host.password,
    sshPrivateKeyPath: host.sshPrivateKeyPath,
  };
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
  selectedHost: null,
  loadedKey: null,

  setData: (data) => set({ data }),

  setSelectedHost: (host) => {
    const prev = get().selectedHost;
    if ((prev?.id ?? null) === (host?.id ?? null)) return;
    set({
      selectedHost: host,
      data: EMPTY_OVERVIEW,
      hasLoaded: false,
      loadedKey: null,
      error: null,
    });
  },

  load: async (hostArg) => {
    const host = hostArg === undefined ? get().selectedHost : hostArg;
    if (hostArg !== undefined) {
      const prev = get().selectedHost;
      if ((prev?.id ?? null) !== (host?.id ?? null)) {
        set({
          selectedHost: host ?? null,
          data: EMPTY_OVERVIEW,
          hasLoaded: false,
          loadedKey: null,
          error: null,
        });
      }
    }

    const key = hostKey(host);
    const { hasLoaded, data, loadedKey } = get();
    const sameHost = loadedKey === key;
    const hasSnapshot =
      sameHost &&
      (hasLoaded ||
        data.containers.length > 0 ||
        data.images.length > 0 ||
        data.diskUsage.length > 0 ||
        data.hostDisks.length > 0);

    if (hasSnapshot) {
      set({ refreshing: true, error: null });
    } else {
      set({ loading: true, error: null });
    }

    try {
      const next = await getDockerOverview(hostAuth(host));
      // Ignore stale responses if the user switched hosts mid-flight.
      if (hostKey(get().selectedHost) !== key) return;
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
        loadedKey: key,
        loading: false,
        refreshing: false,
      });
    } catch (err) {
      if (hostKey(get().selectedHost) !== key) return;
      set({
        error: err instanceof Error ? err.message : String(err),
        loading: false,
        refreshing: false,
        ...(hasSnapshot ? {} : { data: EMPTY_OVERVIEW }),
      });
    }
  },

  pollLive: async (hostArg) => {
    const host = hostArg === undefined ? get().selectedHost : hostArg;
    const key = hostKey(host);
    if (!get().hasLoaded || get().loadedKey !== key) return;
    if (get().loading) return;

    try {
      const containers: DockerContainer[] = await getDockerContainersLive(
        hostAuth(host),
      );
      if (hostKey(get().selectedHost) !== key) return;
      if (!get().hasLoaded || get().loadedKey !== key) return;
      set({
        data: {
          ...get().data,
          containers: containers ?? [],
        },
      });
    } catch {
      // Quiet poll: keep last snapshot; full refresh surfaces errors.
    }
  },
}));
