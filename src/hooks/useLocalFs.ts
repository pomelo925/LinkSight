import { useCallback } from "react";
import { localListDir } from "@/lib/api";
import { useLocalFsStore } from "@/store/useLocalFsStore";

export function useLocalFs() {
  const listing = useLocalFsStore((s) => s.listing);
  const status = useLocalFsStore((s) => s.status);
  const error = useLocalFsStore((s) => s.error);
  const showHidden = useLocalFsStore((s) => s.showHidden);

  const browse = useCallback(async (path?: string | null): Promise<void> => {
    const store = useLocalFsStore.getState();
    store.setStatus("loading");
    store.setError(null);
    try {
      const result = await localListDir({
        path: path ?? store.listing?.path ?? null,
        showHidden: store.showHidden,
      });
      store.setListing(result);
      store.setStatus("ready");
    } catch (err) {
      store.setError(err instanceof Error ? err.message : String(err));
      store.setStatus("error");
    }
  }, []);

  const setShowHidden = useCallback((show: boolean) => {
    useLocalFsStore.getState().setShowHidden(show);
  }, []);

  return { listing, status, error, showHidden, browse, setShowHidden };
}
