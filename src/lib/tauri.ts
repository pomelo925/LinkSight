/**
 * Typed wrapper around Tauri IPC.
 */
import { invoke, isTauri } from "@tauri-apps/api/core";

export { isTauri };

export async function tauriInvoke<T>(
  cmd: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  if (!isTauri()) {
    throw new Error(
      "Backend unavailable — use the LinkSight desktop window (not a browser tab). " +
        "If Tauri failed to start, check the terminal for build errors, then run: " +
        "./run.sh dev → ./scripts/dev.sh",
    );
  }
  return invoke<T>(cmd, args);
}
