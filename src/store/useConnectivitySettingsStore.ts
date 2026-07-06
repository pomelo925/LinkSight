import { create } from "zustand";
import type { ConnectivitySettings } from "@/lib/types";

export const DEFAULT_CONNECTIVITY_SETTINGS: ConnectivitySettings = {
  pingCount: 5,
  tracerouteMaxHops: 30,
  direction: "both",
  iperfStreams: 1,
  protocol: "tcp",
  enableHandshake: true,
  enablePing: true,
  enableMtu: true,
  enableTraceroute: true,
  enableThroughput: true,
};

interface ConnectivitySettingsState extends ConnectivitySettings {
  set: <K extends keyof ConnectivitySettings>(
    key: K,
    value: ConnectivitySettings[K],
  ) => void;
  reset: () => void;
}

export const useConnectivitySettingsStore = create<ConnectivitySettingsState>(
  (set) => ({
    ...DEFAULT_CONNECTIVITY_SETTINGS,
    set: (key, value) => set({ [key]: value } as Partial<ConnectivitySettings>),
    reset: () => set({ ...DEFAULT_CONNECTIVITY_SETTINGS }),
  }),
);

/** Snapshot of just the settings fields (no actions) for passing to the API. */
export function currentConnectivitySettings(): ConnectivitySettings {
  const s = useConnectivitySettingsStore.getState();
  return {
    pingCount: s.pingCount,
    tracerouteMaxHops: s.tracerouteMaxHops,
    direction: s.direction,
    iperfStreams: s.iperfStreams,
    protocol: s.protocol,
    enableHandshake: s.enableHandshake,
    enablePing: s.enablePing,
    enableMtu: s.enableMtu,
    enableTraceroute: s.enableTraceroute,
    enableThroughput: s.enableThroughput,
  };
}
