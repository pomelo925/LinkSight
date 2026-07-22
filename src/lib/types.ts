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
export interface SpeedStageResult {
  label: string;
  bytes: number;
  samplesMbps: number[];
}

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
  downloadLatencyMs: number | null;
  uploadLatencyMs: number | null;
  downloadJitterMs: number | null;
  uploadJitterMs: number | null;
  downloadStages: SpeedStageResult[];
  uploadStages: SpeedStageResult[];
  error: string | null;
}

export type SpeedtestPhase = "latency" | "download" | "upload" | "done";

export interface SpeedSample {
  direction: "download" | "upload";
  stageLabel: string;
  stageIndex: number;
  stageCount: number;
  sampleIndex: number;
  mbps: number;
  stageDone: boolean;
}

export type ConnectivityPhase =
  | "handshake"
  | "ping"
  | "mtu"
  | "traceroute"
  | "uplink"
  | "downlink"
  | "done";

/**
 * Comprehensive local ↔ remote-host connectivity metrics (mirrors
 * `ConnectivityResult` in `src-tauri/src/network/connectivity.rs`).
 */
export interface ConnectivityResult {
  id: string;
  kind: TestKind;
  mode: TestMode;
  target: string;
  status: TestStatus;
  startedAt: string;
  durationMs: number;
  rttMinMs: number | null;
  rttAvgMs: number | null;
  rttMaxMs: number | null;
  delayMs: number | null;
  jitterMs: number | null;
  packetLossPct: number | null;
  maxPayloadBytes: number | null;
  pathMtuBytes: number | null;
  hops: number | null;
  handshakeMs: number | null;
  uplinkMbps: number | null;
  downlinkMbps: number | null;
  bdpBytes: number | null;
  raw: string | null;
  error: string | null;
}

export type ConnectivityDirection = "up" | "down" | "both";
export type ConnectivityProtocol = "tcp" | "udp";

/** Tunable connectivity-test parameters (Connectivity page settings panel). */
export interface ConnectivitySettings {
  pingCount: number;
  tracerouteMaxHops: number;
  direction: ConnectivityDirection;
  iperfStreams: number;
  protocol: ConnectivityProtocol;
  enableHandshake: boolean;
  enablePing: boolean;
  enableMtu: boolean;
  enableTraceroute: boolean;
  enableThroughput: boolean;
}

/** Streamed connectivity-test progress; metric fields fill in per phase. */
export interface ConnectivityProgress {
  phase: ConnectivityPhase;
  progress: number;
  rttMinMs: number | null;
  rttAvgMs: number | null;
  rttMaxMs: number | null;
  delayMs: number | null;
  jitterMs: number | null;
  packetLossPct: number | null;
  maxPayloadBytes: number | null;
  pathMtuBytes: number | null;
  hops: number | null;
  handshakeMs: number | null;
  uplinkMbps: number | null;
  downlinkMbps: number | null;
  bdpBytes: number | null;
  note: string | null;
}

/** A saved remote host (mirrors `HostRecord` in `db/store.rs`). */
export interface HostRecord {
  id: string;
  alias: string;
  hostname: string | null;
  username: string;
  ip: string;
  password: string | null;
  /** Empty / null → SSH default port (22) at connect time. */
  port: number | null;
  /** `ssh` (default) or `password`. */
  authMode: "ssh" | "password";
  /** Local private-key file path (required for SSH mode). */
  sshPrivateKeyPath: string | null;
  /** Optional pasted public key for first-time deploy. */
  sshPublicKey: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface PrivateKeyValidation {
  valid: boolean;
  fingerprint: string | null;
  message: string | null;
}

export interface PublicKeyValidation {
  valid: boolean;
  fingerprint: string | null;
  message: string | null;
}

/** Host verification result (mirrors `VerifyResult` in `ssh/verify.rs`). */
export interface VerifyResult {
  reachable: boolean;
  authenticated: boolean;
  latencyMs: number | null;
  message: string | null;
  publicKeyValid: boolean | null;
  publicKeyFingerprint: string | null;
  authMethod: "password" | "publickey" | null;
  /** True when a public key was deployed during verify (ssh-copy-id). */
  keyDeployed: boolean | null;
  /** Primary remote NIC MAC (best-effort after successful auth). */
  mac?: string | null;
}

export type FileEntryKind = "dir" | "file" | "symlink";
/** @deprecated use FileEntryKind */
export type SftpEntryKind = FileEntryKind;

/** A single file-system entry (local or remote). */
export interface FileEntry {
  name: string;
  path: string;
  kind: FileEntryKind;
  size: number | null;
  modified: number | null;
  permissions: string;
  mode: number | null;
  uid: number | null;
  gid: number | null;
  owner: string | null;
  group: string | null;
}
/** @deprecated use FileEntry */
export type SftpEntry = FileEntry;

/** A resolved directory listing. */
export interface FileListing {
  path: string;
  entries: FileEntry[];
}
/** @deprecated use FileListing */
export type SftpListing = FileListing;

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

/** Local Docker image summary (mirrors `DockerImage` in `system/docker.rs`). */
export interface DockerImage {
  id: string;
  repository: string;
  tag: string;
  size: string;
  createdSince: string;
  createdAt: string;
}

/** Local Docker container summary (mirrors `DockerContainer`). */
export interface DockerContainer {
  id: string;
  names: string;
  image: string;
  command: string;
  status: string;
  state: string;
  ports: string;
  createdAt: string;
  runningFor: string;
  size: string;
  /** From `docker stats` (e.g. `"0.04%"`); empty when unavailable. */
  cpuPerc: string;
  /** From `docker stats` (e.g. `"690.2MiB / 31.09GiB"`); empty when unavailable. */
  memUsage: string;
}

/** One `docker system df` row (mirrors `DockerDiskUsage`). */
export interface DockerDiskUsage {
  typeName: string;
  totalCount: string;
  active: string;
  size: string;
  reclaimable: string;
}

/** One physical disk with capacity + Docker share (mirrors `HostDiskUsage`). */
export interface HostDiskUsage {
  name: string;
  model: string;
  mount: string;
  totalBytes: number;
  usedBytes: number;
  availableBytes: number;
  dockerBytes: number;
}

/** Combined Docker Stats snapshot (mirrors `DockerOverview`). */
export interface DockerOverview {
  containers: DockerContainer[];
  images: DockerImage[];
  diskUsage: DockerDiskUsage[];
  hostDisks: HostDiskUsage[];
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
  downloadLatencyMs?: number | null;
  uploadLatencyMs?: number | null;
  downloadJitterMs?: number | null;
  uploadJitterMs?: number | null;
  sample?: SpeedSample | null;
}

/** Live stage bucket used for measurement charts. */
export interface SpeedStageMeasurements {
  label: string;
  bytes: number;
  samples: number[];
  done: boolean;
}
