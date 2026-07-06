import { useCallback } from "react";
import { runConnectivityTest } from "@/lib/api";
import { useConnectivityStore } from "@/store/useConnectivityStore";
import { currentConnectivitySettings } from "@/store/useConnectivitySettingsStore";
import type { HostRecord } from "@/lib/types";

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

  const execute = useCallback(
    async (host: HostRecord): Promise<void> => {
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
          (p) => setProgress(p),
        );
        setResult(r);
        setStatus(r.status);
        setProgress(null);
      } catch (err) {
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

  return { execute, status, progress, result, hostId };
}
