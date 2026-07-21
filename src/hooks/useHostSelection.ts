import { useCallback } from "react";
import { verifyHost } from "@/lib/api";
import { useHomeStore } from "@/store/useHomeStore";
import type { HostRecord } from "@/lib/types";

/**
 * Selects a remote peer as the active host and kicks off host verification
 * (TCP reachability + auth). Shared by Home and Connectivity so both keep the
 * same verify status.
 */
export function useHostSelection() {
  const setVerify = useHomeStore((s) => s.setVerify);

  return useCallback(
    async (host: HostRecord): Promise<void> => {
      // Atomic select + verifying — avoids an idle frame that would re-trigger
      // mount-time verification on the Connectivity page.
      useHomeStore.setState({
        selectedHost: host,
        verifyStatus: "verifying",
        verifyResult: null,
      });
      try {
        const r = await verifyHost({
          authMode: host.authMode ?? "ssh",
          ip: host.ip,
          port: host.port,
          username: host.username,
          password: host.password,
          sshPrivateKeyPath: host.sshPrivateKeyPath,
          sshPublicKey: host.sshPublicKey,
        });
        setVerify(r.authenticated ? "ok" : "failed", r);
      } catch (err) {
        setVerify("failed", {
          reachable: false,
          authenticated: false,
          latencyMs: null,
          message: err instanceof Error ? err.message : String(err),
          publicKeyValid: null,
          publicKeyFingerprint: null,
          authMethod: null,
          keyDeployed: null,
        });
      }
    },
    [setVerify],
  );
}
