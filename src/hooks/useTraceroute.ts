import { useCallback } from "react";
import { runTraceroute } from "@/lib/api";
import { useTracerouteStore } from "@/store/useTracerouteStore";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Drives a traceroute through the standard flow:
 *   idle → running → analyzing → success/failed
 *
 * State lives in `useTracerouteStore` so results persist across navigation.
 */
export function useTraceroute() {
  const status = useTracerouteStore((s) => s.status);
  const result = useTracerouteStore((s) => s.result);
  const setStatus = useTracerouteStore((s) => s.setStatus);
  const setResult = useTracerouteStore((s) => s.setResult);

  const execute = useCallback(
    async (host: string, maxHops = 30): Promise<void> => {
      setStatus("running");
      try {
        const r = await runTraceroute(host, maxHops);
        setStatus("analyzing");
        await sleep(300);
        setResult(r);
        setStatus(r.status);
      } catch (err) {
        setResult({
          id: crypto.randomUUID(),
          kind: "traceroute",
          mode: "basic",
          target: host,
          status: "failed",
          startedAt: new Date().toISOString(),
          durationMs: 0,
          hops: [],
          raw: null,
          error: err instanceof Error ? err.message : String(err),
        });
        setStatus("failed");
      }
    },
    [setStatus, setResult],
  );

  return { execute, status, result };
}
