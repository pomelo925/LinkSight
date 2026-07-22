/**
 * Typed wrappers around Tauri backend commands.
 *
 * Every network test resolves to the shared `NetworkTestResult` schema so the
 * frontend never needs to special-case a test kind at the transport layer.
 */
import { Channel } from "@tauri-apps/api/core";
import type {
  ConnectivityProgress,
  ConnectivityResult,
  ConnectivitySettings,
  FileEntryKind,
  HostRecord,
  InterfaceInfo,
  DockerImage,
  DockerOverview,
  FileListing,
  NetworkTestResult,
  PingOptions,
  ScanResult,
  SpeedtestProgress,
  SpeedtestResult,
  TracerouteResult,
  VerifyResult,
  PrivateKeyValidation,
  PublicKeyValidation,
} from "./types";
import { tauriInvoke } from "./tauri";

/** Basic Mode: ICMP ping via the system `ping` binary. */
export function runPing(options: PingOptions): Promise<NetworkTestResult> {
  return tauriInvoke<NetworkTestResult>("run_ping", {
    host: options.host,
    count: options.count,
  });
}

/**
 * Basic Mode: LAN discovery via `nmap -sn` (ping-sweep fallback).
 * Pass an empty `cidr` to auto-detect the local subnet.
 */
export function runScan(cidr = ""): Promise<ScanResult> {
  return tauriInvoke<ScanResult>("run_scan", { cidr });
}

/** Basic Mode: traceroute via the system `traceroute` binary. */
export function runTraceroute(
  host: string,
  maxHops = 30,
): Promise<TracerouteResult> {
  return tauriInvoke<TracerouteResult>("run_traceroute", { host, maxHops });
}

/**
 * Basic Mode: internet speed test (download/upload/latency) against
 * Cloudflare's public speed endpoints.
 *
 * Staged progress (latency → download → upload → done) is streamed to
 * `onProgress` via a Tauri channel; the promise resolves with the final result.
 */
export function runSpeedtest(
  onProgress?: (p: SpeedtestProgress) => void,
): Promise<SpeedtestResult> {
  const channel = new Channel<SpeedtestProgress>();
  if (onProgress) channel.onmessage = onProgress;
  return tauriInvoke<SpeedtestResult>("run_speedtest", {
    onProgress: channel,
  });
}

/** Cancel an in-flight network test. */
export function cancelNetworkTest(
  kind: "speedtest" | "connectivity" | "scan" | "traceroute",
): Promise<void> {
  return tauriInvoke<void>("cancel_network_test", { kind });
}

/**
 * Advanced Mode: comprehensive connectivity test against a saved host over SSH
 * (RTT/jitter/loss, path MTU, hops, iperf3 up/down throughput, BDP).
 *
 * Staged progress is streamed to `onProgress` via a Tauri channel; the promise
 * resolves with the final result.
 */
export function runConnectivityTest(
  params: {
    ip: string;
    port?: number | null;
    username: string;
    authMode: "ssh" | "password";
    password?: string | null;
    sshPrivateKeyPath?: string | null;
    settings?: Partial<ConnectivitySettings> | null;
  },
  onProgress?: (p: ConnectivityProgress) => void,
): Promise<ConnectivityResult> {
  const channel = new Channel<ConnectivityProgress>();
  if (onProgress) channel.onmessage = onProgress;
  return tauriInvoke<ConnectivityResult>("run_connectivity_test", {
    ip: params.ip,
    port: params.port ?? null,
    username: params.username,
    authMode: params.authMode,
    password: params.password ?? null,
    sshPrivateKeyPath: params.sshPrivateKeyPath ?? null,
    settings: params.settings ?? null,
    onProgress: channel,
  });
}

// ---- File browser (local + remote SFTP) --------------------------------------

type HostAuthParams = {
  ip: string;
  port?: number | null;
  username: string;
  authMode: "ssh" | "password";
  password?: string | null;
  sshPrivateKeyPath?: string | null;
};

function hostArgs(params: HostAuthParams) {
  return {
    ip: params.ip,
    port: params.port ?? null,
    username: params.username,
    authMode: params.authMode,
    password: params.password ?? null,
    sshPrivateKeyPath: params.sshPrivateKeyPath ?? null,
  };
}

export function localListDir(params: {
  path?: string | null;
  showHidden?: boolean;
}): Promise<FileListing> {
  return tauriInvoke<FileListing>("local_list_dir", {
    path: params.path ?? null,
    showHidden: params.showHidden ?? false,
  });
}

export function localMkdir(path: string): Promise<void> {
  return tauriInvoke<void>("local_mkdir", { path });
}

export function localRename(oldPath: string, newPath: string): Promise<void> {
  return tauriInvoke<void>("local_rename", { oldPath, newPath });
}

export function localRemove(path: string, kind: FileEntryKind): Promise<void> {
  return tauriInvoke<void>("local_remove", { path, kind });
}

export function localSetPermissions(path: string, mode: number): Promise<void> {
  return tauriInvoke<void>("local_set_permissions", { path, mode });
}

export function sftpListDir(
  params: HostAuthParams & { path?: string | null; showHidden?: boolean },
): Promise<FileListing> {
  return tauriInvoke<FileListing>("sftp_list_dir", {
    ...hostArgs(params),
    path: params.path ?? null,
    showHidden: params.showHidden ?? false,
  });
}

export function sftpMkdir(params: HostAuthParams & { path: string }): Promise<void> {
  return tauriInvoke<void>("sftp_mkdir", { ...hostArgs(params), path: params.path });
}

export function sftpRename(
  params: HostAuthParams & { oldPath: string; newPath: string },
): Promise<void> {
  return tauriInvoke<void>("sftp_rename", {
    ...hostArgs(params),
    oldPath: params.oldPath,
    newPath: params.newPath,
  });
}

export function sftpRemove(
  params: HostAuthParams & { path: string; kind: FileEntryKind },
): Promise<void> {
  return tauriInvoke<void>("sftp_remove", {
    ...hostArgs(params),
    path: params.path,
    kind: params.kind,
  });
}

export function sftpSetPermissions(
  params: HostAuthParams & { path: string; mode: number },
): Promise<void> {
  return tauriInvoke<void>("sftp_set_permissions", {
    ...hostArgs(params),
    path: params.path,
    mode: params.mode,
  });
}

export function sftpUpload(
  params: HostAuthParams & { localPath: string; remoteDir: string },
): Promise<void> {
  return tauriInvoke<void>("sftp_upload", {
    ...hostArgs(params),
    localPath: params.localPath,
    remoteDir: params.remoteDir,
  });
}

export function sftpDownload(
  params: HostAuthParams & { remotePath: string; localDir: string },
): Promise<void> {
  return tauriInvoke<void>("sftp_download", {
    ...hostArgs(params),
    remotePath: params.remotePath,
    localDir: params.localDir,
  });
}

/** Enumerate the local machine's network interfaces. */
export function listNetworkInterfaces(): Promise<InterfaceInfo[]> {
  return tauriInvoke<InterfaceInfo[]>("list_network_interfaces");
}

/** List local Docker images via the host `docker` CLI. */
export function listDockerImages(): Promise<DockerImage[]> {
  return tauriInvoke<DockerImage[]>("list_docker_images");
}

/** Containers, images, and `docker system df` for the Docker Stats page. */
export function getDockerOverview(): Promise<DockerOverview> {
  return tauriInvoke<DockerOverview>("get_docker_overview");
}

export function dockerStopContainer(id: string): Promise<void> {
  return tauriInvoke<void>("docker_stop_container", { id });
}

export function dockerRestartContainer(id: string): Promise<void> {
  return tauriInvoke<void>("docker_restart_container", { id });
}

export function dockerRemoveContainer(id: string): Promise<void> {
  return tauriInvoke<void>("docker_remove_container", { id });
}

export function dockerRenameImage(params: {
  id: string;
  oldRepository: string;
  oldTag: string;
  repository: string;
  tag: string;
}): Promise<void> {
  return tauriInvoke<void>("docker_rename_image", {
    id: params.id,
    oldRepository: params.oldRepository,
    oldTag: params.oldTag,
    repository: params.repository,
    tag: params.tag,
  });
}

export function dockerRemoveImage(idOrRef: string): Promise<void> {
  return tauriInvoke<void>("docker_remove_image", { idOrRef });
}

// ---- Saved hosts (Termius-style host manager) --------------------------------

export function listHosts(): Promise<HostRecord[]> {
  return tauriInvoke<HostRecord[]>("list_hosts");
}

/** Create (empty `id`) or update a saved host. Returns the stored record. */
export function saveHost(host: HostRecord): Promise<HostRecord> {
  return tauriInvoke<HostRecord>("save_host", { host });
}

export function deleteHost(id: string): Promise<void> {
  return tauriInvoke<void>("delete_host", { id });
}

/** Verify a host: TCP reachability then SSH password or public-key auth. */
export function verifyHost(params: {
  authMode: "ssh" | "password";
  ip: string;
  port?: number | null;
  username: string;
  password?: string | null;
  sshPrivateKeyPath?: string | null;
  sshPublicKey?: string | null;
}): Promise<VerifyResult> {
  return tauriInvoke<VerifyResult>("verify_host", {
    authMode: params.authMode,
    ip: params.ip,
    port: params.port ?? null,
    username: params.username,
    password: params.password ?? null,
    sshPrivateKeyPath: params.sshPrivateKeyPath ?? null,
    sshPublicKey: params.sshPublicKey ?? null,
  });
}

/** Validate a local private-key file (no network). */
export function validateSshPrivateKey(path: string): Promise<PrivateKeyValidation> {
  return tauriInvoke<PrivateKeyValidation>("validate_ssh_private_key", { path });
}

/** Validate OpenSSH public-key format (no network). */
export function validateSshPublicKey(params: {
  sshPublicKey?: string | null;
}): Promise<PublicKeyValidation> {
  return tauriInvoke<PublicKeyValidation>("validate_ssh_public_key", {
    sshPublicKey: params.sshPublicKey ?? null,
  });
}

/** Persist pasted private-key content to the app data dir; returns the file path. */
export function persistSshKeyFile(content: string): Promise<string> {
  return tauriInvoke<string>("persist_ssh_key_file", { content });
}

/** Read a local key file (re-open editor for saved hosts). */
export function readLocalKeyFile(path: string): Promise<string> {
  return tauriInvoke<string>("read_local_key_file", { path });
}
