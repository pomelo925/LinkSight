import { useCallback } from "react";
import { sftpListDir } from "@/lib/api";
import { useSftpStore } from "@/store/useSftpStore";
import type { HostRecord } from "@/lib/types";

export function useSftp() {
  const hostId = useSftpStore((s) => s.hostId);
  const listing = useSftpStore((s) => s.listing);
  const status = useSftpStore((s) => s.status);
  const error = useSftpStore((s) => s.error);
  const showHidden = useSftpStore((s) => s.showHidden);

  const browse = useCallback(
    async (host: HostRecord, path?: string | null): Promise<void> => {
      const store = useSftpStore.getState();
      if (store.hostId !== host.id) store.setListing(null);
      store.setHostId(host.id);
      store.setStatus("loading");
      store.setError(null);
      try {
        const result = await sftpListDir({
          ip: host.ip,
          port: host.port,
          username: host.username,
          authMode: host.authMode ?? "ssh",
          password: host.password,
          sshPrivateKeyPath: host.sshPrivateKeyPath,
          path: path ?? store.listing?.path ?? null,
          showHidden: store.showHidden,
        });
        store.setListing(result);
        store.setStatus("ready");
      } catch (err) {
        store.setError(err instanceof Error ? err.message : String(err));
        store.setStatus("error");
      }
    },
    [],
  );

  const setShowHidden = useCallback((show: boolean) => {
    useSftpStore.getState().setShowHidden(show);
  }, []);

  const reset = useCallback(() => {
    useSftpStore.getState().reset();
  }, []);

  return { hostId, listing, status, error, showHidden, browse, setShowHidden, reset };
}
