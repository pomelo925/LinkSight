import { useCallback, useRef } from "react";
import { cancelNetworkTest, runTraceroute } from "@/lib/api";
import { useTracerouteStore } from "@/store/useTracerouteStore";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function isCancelError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.toLowerCase().includes("cancelled");
}

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
  const runIdRef = useRef(0);

  const cancel = useCallback(async (): Promise<void> => {
    runIdRef.current += 1;
    try {
      await cancelNetworkTest("traceroute");
    } catch {
      /* best-effort */
    }
    setStatus("idle");
  }, [setStatus]);

  const execute = useCallback(
    async (host: string, maxHops = 30): Promise<void> => {
      const runId = ++runIdRef.current;
      setStatus("running");
      try {
        const r = await runTraceroute(host, maxHops);
        if (runIdRef.current !== runId) return;
        setStatus("analyzing");
        await sleep(300);
        if (runIdRef.current !== runId) return;
        setResult(r);
        setStatus(r.status);
      } catch (err) {
        if (runIdRef.current !== runId || isCancelError(err)) {
          if (runIdRef.current === runId) setStatus("idle");
          return;
        }
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

  return { execute, cancel, status, result };
}
