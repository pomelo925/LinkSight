import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ChevronDown,
  CornerLeftUp,
  File as FileIcon,
  Folder,
  HardDrive,
  Link2,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PathInput } from "@/features/sftp/SftpPane";
import { useI18n } from "@/hooks/useI18n";
import { localListDir } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { FileEntry, FileEntryKind, FileListing } from "@/lib/types";
import type { FsStatus } from "@/store/useSftpStore";

type PickerActionId = "select" | "refresh" | "hidden";

function EntryIcon({ kind }: { kind: FileEntryKind }) {
  if (kind === "dir")
    return <Folder className="h-4 w-4 shrink-0 fill-primary/20 text-primary" />;
  if (kind === "symlink")
    return <Link2 className="h-4 w-4 shrink-0 text-sky-400" />;
  return <FileIcon className="h-4 w-4 shrink-0 text-muted-foreground" />;
}

function PickerActionsMenu({
  showHidden,
  canSelect,
  onAction,
}: {
  showHidden: boolean;
  canSelect: boolean;
  onAction: (id: PickerActionId) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const items: {
    id: PickerActionId;
    label: string;
    disabled?: boolean;
    checked?: boolean;
  }[] = [
    { id: "select", label: t("hosts.sshKey.actions.select"), disabled: !canSelect },
    { id: "refresh", label: t("sftp.actions.refresh") },
    { id: "hidden", label: t("sftp.actions.showHidden"), checked: showHidden },
  ];

  return (
    <div ref={ref} className="relative">
      <Button
        size="sm"
        variant="secondary"
        className="h-8 gap-1 px-2.5 text-xs"
        onClick={() => setOpen((v) => !v)}
      >
        {t("sftp.actions.menu")}
        <ChevronDown className="h-3.5 w-3.5" />
      </Button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 min-w-[12rem] overflow-hidden rounded-md border border-border bg-card py-1 shadow-xl">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              disabled={item.disabled}
              onClick={() => {
                setOpen(false);
                onAction(item.id);
              }}
              className={cn(
                "flex w-full items-center px-3 py-2 text-left text-sm transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40",
              )}
            >
              {item.label}
              {item.checked && (
                <span className="ml-auto text-xs text-primary">✓</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Local-only file browser for the SSH key picker dialog.
 * Isolated from the SFTP page store.
 */
export function LocalKeyFsBrowser({
  onPickFile,
}: {
  onPickFile: (entry: FileEntry) => void;
}) {
  const { t } = useI18n();
  const [listing, setListing] = useState<FileListing | null>(null);
  const [status, setStatus] = useState<FsStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [showHidden, setShowHidden] = useState(true);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const showHiddenRef = useRef(showHidden);
  showHiddenRef.current = showHidden;

  const loading = status === "loading";
  const atRoot = listing?.path === "/";
  const selected = listing?.entries.find((e) => e.path === selectedPath) ?? null;
  const canSelect = !!selected && selected.kind === "file";

  const browse = useCallback(async (path?: string | null) => {
    setStatus("loading");
    setError(null);
    try {
      const result = await localListDir({
        path: path ?? null,
        showHidden: showHiddenRef.current,
      });
      setListing(result);
      setSelectedPath(null);
      setStatus("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  }, []);

  // Prefer ~/.ssh; silently fall back to $HOME.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setStatus("loading");
      setError(null);
      try {
        const ssh = await localListDir({ path: "~/.ssh", showHidden: true });
        if (cancelled) return;
        setListing(ssh);
        setStatus("ready");
      } catch {
        try {
          const home = await localListDir({ path: "~", showHidden: true });
          if (cancelled) return;
          setListing(home);
          setStatus("ready");
        } catch (err) {
          if (cancelled) return;
          setError(err instanceof Error ? err.message : String(err));
          setStatus("error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Re-list current dir when show-hidden toggles (not when path changes).
  useEffect(() => {
    if (!listing) return;
    void browse(listing.path);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- showHidden only
  }, [showHidden]);

  const entries = useMemo(() => {
    if (!listing) return [];
    return [...listing.entries].sort((a, b) => {
      const ka = a.kind === "dir" ? 0 : a.kind === "symlink" ? 1 : 2;
      const kb = b.kind === "dir" ? 0 : b.kind === "symlink" ? 1 : 2;
      return ka - kb || a.name.toLowerCase().localeCompare(b.name.toLowerCase());
    });
  }, [listing]);

  const navigate = (path: string) => void browse(path);
  const goUp = () => {
    if (!listing) return;
    void browse(`${listing.path}/..`);
  };
  const goHome = () => void browse("~");

  const pickSelected = () => {
    if (selected?.kind === "file") onPickFile(selected);
  };

  const onAction = (id: PickerActionId) => {
    if (id === "select") pickSelected();
    else if (id === "refresh") void browse(listing?.path ?? "~");
    else if (id === "hidden") setShowHidden((v) => !v);
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{t("hosts.sshKey.browser.title")}</p>
          <p className="truncate text-xs text-muted-foreground">
            {t("hosts.sshKey.browser.subtitle")}
          </p>
        </div>
        <PickerActionsMenu
          showHidden={showHidden}
          canSelect={canSelect}
          onAction={onAction}
        />
      </div>

      <div className="flex shrink-0 items-center gap-1 border-b border-border px-2 py-1.5">
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          disabled={atRoot || !listing || loading}
          aria-label={t("sftp.nav.up")}
          onClick={goUp}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          disabled={loading}
          aria-label={t("sftp.nav.refresh")}
          onClick={() => void browse(listing?.path ?? "~")}
        >
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          disabled={loading}
          aria-label={t("sftp.nav.home")}
          onClick={goHome}
        >
          <HardDrive className="h-3.5 w-3.5" />
        </Button>
        <div className="mx-0.5 h-4 w-px bg-border" />
        <PathInput
          path={listing?.path ?? ""}
          onNavigate={navigate}
          disabled={loading}
          placeholder={t("hosts.sshKey.browser.pathPlaceholder")}
        />
      </div>

      <div className="relative min-h-0 flex-1 overflow-y-auto p-1">
        {!listing && loading && (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        )}

        {!listing && status === "error" && (
          <div className="space-y-2 p-4 text-center">
            <p className="text-sm text-destructive">{error ?? t("common.error")}</p>
            <Button size="sm" variant="secondary" onClick={goHome}>
              {t("common.retry")}
            </Button>
          </div>
        )}

        {listing && (
          <>
            {loading && (
              <div className="pointer-events-none absolute inset-0 z-10 flex items-start justify-center bg-background/40 pt-4">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
              </div>
            )}
            {error && status === "error" && (
              <p className="px-2 py-1 text-xs text-destructive">{error}</p>
            )}
            {!atRoot && (
              <button
                type="button"
                onClick={goUp}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-accent/60"
              >
                <CornerLeftUp className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">..</span>
              </button>
            )}
            {entries.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {t("sftp.empty.folder")}
              </p>
            )}
            {entries.map((entry) => {
              const navigable = entry.kind === "dir" || entry.kind === "symlink";
              const selectedRow = selectedPath === entry.path;
              return (
                <button
                  key={entry.path}
                  type="button"
                  onClick={() => {
                    setSelectedPath(entry.path);
                    if (entry.kind === "file") onPickFile(entry);
                  }}
                  onDoubleClick={() => {
                    if (navigable) navigate(entry.path);
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left transition-colors",
                    selectedRow ? "bg-primary/15" : "hover:bg-accent/60",
                  )}
                >
                  <EntryIcon kind={entry.kind} />
                  <span className="min-w-0 flex-1 truncate text-sm">{entry.name}</span>
                </button>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
