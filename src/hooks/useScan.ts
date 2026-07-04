import { useCallback } from "react";
import { runScan } from "@/lib/api";
import { useScanStore } from "@/store/useScanStore";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Drives a LAN scan through the standard flow:
 *   idle → running → analyzing → success/failed
 *
 * State lives in `useScanStore` so results persist across page navigation
 * until the next scan.
 */
export function useScan() {
  const status = useScanStore((s) => s.status);
  const result = useScanStore((s) => s.result);
  const setStatus = useScanStore((s) => s.setStatus);
  const setResult = useScanStore((s) => s.setResult);

  const execute = useCallback(
    async (cidr: string): Promise<void> => {
      setStatus("running");
      try {
        const r = await runScan(cidr);
        setStatus("analyzing");
        await sleep(300);
        setResult(r);
        setStatus(r.status);
      } catch (err) {
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
    [setStatus, setResult],
  );

  return { execute, status, result };
}
