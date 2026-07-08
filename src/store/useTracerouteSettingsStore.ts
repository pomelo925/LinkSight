import { create } from "zustand";
import { persist } from "zustand/middleware";

export const DEFAULT_TRACE_HOST = "speed.cloudflare.com";
export const DEFAULT_TRACE_MAX_HOPS = 30;
export const GATEWAY_TRACE_MAX_HOPS = 1;

/** Presets shown in Settings (hostname or IP). */
export const TRACE_HOST_PRESETS = [
  { id: "cloudflare", host: "speed.cloudflare.com" },
  { id: "cfDns", host: "1.1.1.1" },
  { id: "googleDns", host: "8.8.8.8" },
  { id: "gateway", host: "", maxHops: GATEWAY_TRACE_MAX_HOPS },
] as const;

export function normalizeTraceHost(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidTraceHost(host: string): boolean {
  const h = normalizeTraceHost(host);
  if (!h) return false;
  return h
    .split("")
    .every((c) => /[a-z0-9.\-:_]/.test(c));
}

interface TracerouteSettingsState {
  traceHost: string;
  traceMaxHops: number;
  setTraceHost: (host: string) => void;
  setTraceMaxHops: (hops: number) => void;
}

export const useTracerouteSettingsStore = create<TracerouteSettingsState>()(
  persist(
    (set) => ({
      traceHost: DEFAULT_TRACE_HOST,
      traceMaxHops: DEFAULT_TRACE_MAX_HOPS,
      setTraceHost: (traceHost) => set({ traceHost: normalizeTraceHost(traceHost) }),
      setTraceMaxHops: (traceMaxHops) =>
        set({ traceMaxHops: Math.min(64, Math.max(1, Math.round(traceMaxHops))) }),
    }),
    { name: "linksight-traceroute-settings" },
  ),
);
