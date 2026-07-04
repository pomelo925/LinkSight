import { useCallback } from "react";
import { runPing } from "@/lib/api";
import { useTestStore } from "@/store/useTestStore";
import type { NetworkTestResult, PingOptions } from "@/lib/types";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Drives the ping test through the standard flow:
 *   idle → running → analyzing → success/failed
 */
export function usePing() {
  const setStatus = useTestStore((s) => s.setStatus);
  const pushResult = useTestStore((s) => s.pushResult);
  const status = useTestStore((s) => s.status);

  const execute = useCallback(
    async (options: PingOptions): Promise<NetworkTestResult | null> => {
      setStatus("running");
      try {
        const result = await runPing(options);
        // Brief analysis phase so the UI can animate the transition.
        setStatus("analyzing");
        await sleep(400);
        pushResult(result);
        return result;
      } catch (err) {
        const failed: NetworkTestResult = {
          id: crypto.randomUUID(),
          kind: "ping",
          mode: "basic",
          target: options.host,
          status: "failed",
          startedAt: new Date().toISOString(),
          durationMs: 0,
          summary: {
            rttMinMs: null,
            rttAvgMs: null,
            rttMaxMs: null,
            jitterMs: null,
            packetLossPct: null,
            bandwidthMbps: null,
            hops: null,
          },
          raw: null,
          error: err instanceof Error ? err.message : String(err),
        };
        pushResult(failed);
        return failed;
      }
    },
    [setStatus, pushResult],
  );

  return { execute, status };
}
