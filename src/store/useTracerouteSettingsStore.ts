import { create } from "zustand";
import { persist } from "zustand/middleware";

export const DEFAULT_TRACE_HOST = "speed.cloudflare.com";
export const DEFAULT_TRACE_MAX_HOPS = 30;

export type TraceHostPresetId = "cloudflare" | "cfDns" | "googleDns";

/** Named presets shown in the trace-target dropdown (hostname or IP). */
export const TRACE_HOST_PRESETS: readonly {
  id: TraceHostPresetId;
  host: string;
}[] = [
  { id: "cloudflare", host: "speed.cloudflare.com" },
  { id: "cfDns", host: "1.1.1.1" },
  { id: "googleDns", host: "8.8.8.8" },
] as const;

export function normalizeTraceHost(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidTraceHost(host: string): boolean {
  const h = normalizeTraceHost(host);
  if (!h) return false;
  return h.split("").every((c) => /[a-z0-9.\-:_]/.test(c));
}

/** Resolve which preset matches `host`, or `"custom"` when none match. */
export function matchTraceHostPreset(
  host: string,
): TraceHostPresetId | "custom" {
  const n = normalizeTraceHost(host);
  const found = TRACE_HOST_PRESETS.find((p) => normalizeTraceHost(p.host) === n);
  return found?.id ?? "custom";
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
