import { useCallback } from "react";
import { runSpeedtest } from "@/lib/api";
import { useSpeedtestStore } from "@/store/useSpeedtestStore";

/**
 * Drives an internet speed test through staged, real-time progress:
 *   latency → download → upload → done
 *
 * Live progress is streamed from the backend via a Tauri channel. State lives
 * in `useSpeedtestStore` so results persist across navigation.
 */
export function useSpeedtest() {
  const status = useSpeedtestStore((s) => s.status);
  const progress = useSpeedtestStore((s) => s.progress);
  const result = useSpeedtestStore((s) => s.result);
  const setStatus = useSpeedtestStore((s) => s.setStatus);
  const setProgress = useSpeedtestStore((s) => s.setProgress);
  const setResult = useSpeedtestStore((s) => s.setResult);

  const execute = useCallback(async (): Promise<void> => {
    setStatus("running");
    setResult(null);
    setProgress({
      phase: "latency",
      progress: 0,
      latencyMs: null,
      jitterMs: null,
      downloadMbps: null,
      uploadMbps: null,
    });
    try {
      const r = await runSpeedtest((p) => setProgress(p));
      setResult(r);
      setStatus(r.status);
      setProgress(null);
    } catch (err) {
      setResult({
        id: crypto.randomUUID(),
        kind: "speedtest",
        mode: "basic",
        target: "speed.cloudflare.com",
        status: "failed",
        startedAt: new Date().toISOString(),
        durationMs: 0,
        downloadMbps: null,
        uploadMbps: null,
        latencyMs: null,
        jitterMs: null,
        error: err instanceof Error ? err.message : String(err),
      });
      setStatus("failed");
      setProgress(null);
    }
  }, [setStatus, setProgress, setResult]);

  return { execute, status, progress, result };
}
