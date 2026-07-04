/**
 * Shared result schema (mirrors the Rust structs in
 * `src-tauri/src/network/model.rs`).
 *
 * Both Basic Mode (ping/traceroute/scan/speedtest) and Advanced Mode
 * (iperf3/ssh/remote metrics) return `NetworkTestResult` so the UI can render
 * any test through the same components.
 */

export type TestKind =
  | "ping"
  | "traceroute"
  | "scan"
  | "speedtest"
  | "iperf"
  | "latency";

export type TestMode = "basic" | "advanced";

export type TestStatus =
  | "idle"
  | "running"
  | "analyzing"
  | "success"
  | "failed";

/** Normalized metrics shared across every test kind. */
export interface TestSummary {
  rttMinMs: number | null;
  rttAvgMs: number | null;
  rttMaxMs: number | null;
  jitterMs: number | null;
  packetLossPct: number | null;
  bandwidthMbps: number | null;
  hops: number | null;
}

export interface NetworkTestResult {
  id: string;
  kind: TestKind;
  mode: TestMode;
  target: string;
  status: TestStatus;
  startedAt: string;
  durationMs: number;
  summary: TestSummary;
  /** Raw tool output (e.g. full ping stdout) for the details view. */
  raw: string | null;
  error: string | null;
}

export interface PingOptions {
  host: string;
  count: number;
}
