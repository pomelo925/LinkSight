import { useCallback, useRef } from "react";
import { cancelNetworkTest, runConnectivityTest } from "@/lib/api";
import { useConnectivityStore } from "@/store/useConnectivityStore";
import { currentConnectivitySettings } from "@/store/useConnectivitySettingsStore";
import type { HostRecord } from "@/lib/types";

function isCancelError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.toLowerCase().includes("cancelled");
}

/**
 * Drives a comprehensive connectivity test against a saved host through staged,
 * real-time progress:
 *   handshake → ping → mtu → traceroute → uplink → downlink → done
 *
 * State lives in `useConnectivityStore` so results persist across navigation.
 */
export function useConnectivity() {
  const status = useConnectivityStore((s) => s.status);
  const progress = useConnectivityStore((s) => s.progress);
  const result = useConnectivityStore((s) => s.result);
  const hostId = useConnectivityStore((s) => s.hostId);
  const setStatus = useConnectivityStore((s) => s.setStatus);
  const setProgress = useConnectivityStore((s) => s.setProgress);
  const setResult = useConnectivityStore((s) => s.setResult);
  const setHostId = useConnectivityStore((s) => s.setHostId);
  const runIdRef = useRef(0);

  const cancel = useCallback(async (): Promise<void> => {
    runIdRef.current += 1;
    try {
      await cancelNetworkTest("connectivity");
    } catch {
      /* best-effort */
    }
    setStatus("idle");
    setProgress(null);
  }, [setStatus, setProgress]);

  const execute = useCallback(
    async (host: HostRecord): Promise<void> => {
      const runId = ++runIdRef.current;
      setHostId(host.id);
      setStatus("running");
      setResult(null);
      setProgress(null);
      try {
        const r = await runConnectivityTest(
          {
            ip: host.ip,
            port: host.port,
            username: host.username,
            authMode: host.authMode ?? "ssh",
            password: host.password,
            sshPrivateKeyPath: host.sshPrivateKeyPath,
            settings: currentConnectivitySettings(),
          },
          (p) => {
            if (runIdRef.current === runId) setProgress(p);
          },
        );
        if (runIdRef.current !== runId) return;
        setResult(r);
        setStatus(r.status);
        setProgress(null);
      } catch (err) {
        if (runIdRef.current !== runId || isCancelError(err)) {
          if (runIdRef.current === runId) {
            setStatus("idle");
            setProgress(null);
          }
          return;
        }
        setResult({
          id: crypto.randomUUID(),
          kind: "iperf",
          mode: "advanced",
          target: host.ip,
          status: "failed",
          startedAt: new Date().toISOString(),
          durationMs: 0,
          rttMinMs: null,
          rttAvgMs: null,
          rttMaxMs: null,
          delayMs: null,
          jitterMs: null,
          packetLossPct: null,
          maxPayloadBytes: null,
          pathMtuBytes: null,
          hops: null,
          handshakeMs: null,
          uplinkMbps: null,
          downlinkMbps: null,
          bdpBytes: null,
          raw: null,
          error: err instanceof Error ? err.message : String(err),
        });
        setStatus("failed");
        setProgress(null);
      }
    },
    [setHostId, setStatus, setProgress, setResult],
  );

  return { execute, cancel, status, progress, result, hostId };
}
