/**
 * Typed wrappers around Tauri backend commands.
 *
 * Every network test resolves to the shared `NetworkTestResult` schema so the
 * frontend never needs to special-case a test kind at the transport layer.
 */
import { Channel } from "@tauri-apps/api/core";
import type {
  HostRecord,
  InterfaceInfo,
  NetworkTestResult,
  PingOptions,
  ScanResult,
  SpeedtestProgress,
  SpeedtestResult,
  TracerouteResult,
  VerifyResult,
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

/** Enumerate the local machine's network interfaces. */
export function listNetworkInterfaces(): Promise<InterfaceInfo[]> {
  return tauriInvoke<InterfaceInfo[]>("list_network_interfaces");
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

/** Verify a host: TCP reachability then SSH password authentication. */
export function verifyHost(
  ip: string,
  port: number,
  username: string,
  password: string,
): Promise<VerifyResult> {
  return tauriInvoke<VerifyResult>("verify_host", {
    ip,
    port,
    username,
    password,
  });
}
