/**
 * Typed wrappers around Tauri backend commands.
 *
 * Every network test resolves to the shared `NetworkTestResult` schema so the
 * frontend never needs to special-case a test kind at the transport layer.
 */
import { invoke } from "@tauri-apps/api/core";
import type { NetworkTestResult, PingOptions } from "./types";

/** Basic Mode: ICMP ping via the system `ping` binary. */
export function runPing(options: PingOptions): Promise<NetworkTestResult> {
  return invoke<NetworkTestResult>("run_ping", {
    host: options.host,
    count: options.count,
  });
}
