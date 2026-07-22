import { useCallback, useRef } from "react";
import { cancelNetworkTest, runScan } from "@/lib/api";
import { useScanStore } from "@/store/useScanStore";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function isCancelError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.toLowerCase().includes("cancelled");
}

/**
 * Drives a LAN scan through the standard flow:
 *   idle → running → analyzing → success/failed
 *
 * State lives in `useScanStore` so results persist across page navigation.
 * A refresh keeps the previous result visible until the new one arrives.
 */
export function useScan() {
  const status = useScanStore((s) => s.status);
  const result = useScanStore((s) => s.result);
  const lastCidr = useScanStore((s) => s.lastCidr);
  const setStatus = useScanStore((s) => s.setStatus);
  const setResult = useScanStore((s) => s.setResult);
  const setLastCidr = useScanStore((s) => s.setLastCidr);
  const runIdRef = useRef(0);

  const cancel = useCallback(async (): Promise<void> => {
    runIdRef.current += 1;
    try {
      await cancelNetworkTest("scan");
    } catch {
      /* best-effort */
    }
    setStatus("idle");
  }, [setStatus]);

  const execute = useCallback(
    async (cidr: string): Promise<void> => {
      const runId = ++runIdRef.current;
      setLastCidr(cidr);
      setStatus("running");
      // Keep the previous result on screen until the new scan finishes.
      try {
        const r = await runScan(cidr);
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
          kind: "scan",
          mode: "basic",
          target: cidr || "auto",
          status: "failed",
          startedAt: new Date().toISOString(),
          durationMs: 0,
          devices: [],
          raw: null,
          error: err instanceof Error ? err.message : String(err),
        });
        setStatus("failed");
      }
    },
    [setStatus, setResult, setLastCidr],
  );

  const refresh = useCallback(async (): Promise<void> => {
    const cidr = useScanStore.getState().lastCidr;
    await execute(cidr);
  }, [execute]);

  return { execute, cancel, refresh, status, result, lastCidr };
}
