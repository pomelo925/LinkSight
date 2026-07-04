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

/** A single host discovered by a LAN scan. */
export interface DiscoveredDevice {
  ip: string;
  hostname: string | null;
  mac: string | null;
  vendor: string | null;
  latencyMs: number | null;
}

/**
 * LAN scan result. Shares the test metadata shape with `NetworkTestResult`
 * but carries a device list instead of scalar metrics.
 */
export interface ScanResult {
  id: string;
  kind: TestKind;
  mode: TestMode;
  target: string;
  status: TestStatus;
  startedAt: string;
  durationMs: number;
  devices: DiscoveredDevice[];
  raw: string | null;
  error: string | null;
}

/** A single hop along a traceroute path. */
export interface TraceHop {
  ttl: number;
  host: string | null;
  ip: string | null;
  rttsMs: number[];
  timedOut: boolean;
}

/** Traceroute result — carries a hop list instead of scalar metrics. */
export interface TracerouteResult {
  id: string;
  kind: TestKind;
  mode: TestMode;
  target: string;
  status: TestStatus;
  startedAt: string;
  durationMs: number;
  hops: TraceHop[];
  raw: string | null;
  error: string | null;
}

/**
 * Internet speed test result — download/upload throughput plus latency.
 * (mirrors `SpeedtestResult` in `src-tauri/src/network/speedtest.rs`).
 */
export interface SpeedtestResult {
  id: string;
  kind: TestKind;
  mode: TestMode;
  target: string;
  status: TestStatus;
  startedAt: string;
  durationMs: number;
  downloadMbps: number | null;
  uploadMbps: number | null;
  latencyMs: number | null;
  jitterMs: number | null;
  error: string | null;
}

export type SpeedtestPhase = "latency" | "download" | "upload" | "done";

/** A saved remote host (mirrors `HostRecord` in `db/store.rs`). */
export interface HostRecord {
  id: string;
  alias: string;
  hostname: string | null;
  username: string;
  ip: string;
  password: string | null;
  port: number;
  createdAt?: string | null;
  updatedAt?: string | null;
}

/** Host verification result (mirrors `VerifyResult` in `ssh/verify.rs`). */
export interface VerifyResult {
  reachable: boolean;
  authenticated: boolean;
  latencyMs: number | null;
  message: string | null;
}

export type InterfaceKind = "wifi" | "ethernet" | "loopback" | "virtual";

/** Host network interface (mirrors `InterfaceInfo` in `system/interface.rs`). */
export interface InterfaceInfo {
  name: string;
  kind: InterfaceKind;
  isUp: boolean;
  mac: string | null;
  ipv4: string | null;
  rxBytes: number;
  txBytes: number;
}

/**
 * Streamed speed-test progress (mirrors `SpeedtestProgress` in the backend).
 * `progress` is 0–1 within the current phase.
 */
export interface SpeedtestProgress {
  phase: SpeedtestPhase;
  progress: number;
  latencyMs: number | null;
  jitterMs: number | null;
  downloadMbps: number | null;
  uploadMbps: number | null;
}
