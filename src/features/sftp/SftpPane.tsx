import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import {
  Folder,
  File as FileIcon,
  Link2,
  CornerLeftUp,
  ArrowLeft,
  RefreshCw,
  HardDrive,
  ChevronDown,
  Loader2,
  Search,
  FolderOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SortHeader } from "@/components/ui/sort-header";
import { useI18n } from "@/hooks/useI18n";
import { dateLocale } from "@/lib/i18n";
import { HOVER_POP_GROUP, HOVER_POP_GROUP_SUBTLE } from "@/lib/interactive";
import { cn } from "@/lib/utils";
import type { FileEntry, FileEntryKind, FileListing } from "@/lib/types";
import type { FsStatus } from "@/store/useSftpStore";

// Column order: Name → Date → Size → Type
const COLS =
  "grid grid-cols-[minmax(0,1fr)_9.375rem_6rem_4.5rem] items-center gap-3";

type SortKey = "name" | "size" | "date" | "kind";
type SortDir = "asc" | "desc";

const KIND_ORDER: Record<FileEntryKind, number> = {
  dir: 0,
  symlink: 1,
  file: 2,
};

/** Compare two nullable numbers, treating null as the smallest value. */
function compareNullableNum(a: number | null, b: number | null): number {
  if (a == null && b == null) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  return a - b;
}

function compareEntries(a: FileEntry, b: FileEntry, key: SortKey): number {
  switch (key) {
    case "size":
      return (
        compareNullableNum(a.size, b.size) ||
        a.name.toLowerCase().localeCompare(b.name.toLowerCase())
      );
    case "date":
      return (
        compareNullableNum(a.modified, b.modified) ||
        a.name.toLowerCase().localeCompare(b.name.toLowerCase())
      );
    case "kind":
      return (
        KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
        a.name.toLowerCase().localeCompare(b.name.toLowerCase())
      );
    case "name":
    default:
      return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
  }
}

function formatSize(bytes: number | null, t: (key: string) => string): string {
  if (bytes == null) return t("common.emptyValue");
  if (bytes < 1024) return `${bytes} ${t("common.unit.b")}`;
  const units = [
    t("common.unit.kb"),
    t("common.unit.mb"),
    t("common.unit.gb"),
    t("common.unit.tb"),
  ];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[i]}`;
}

function formatDate(
  secs: number | null,
  locale: ReturnType<typeof useI18n>["locale"],
  empty: string,
): string {
  if (secs == null) return empty;
  return new Date(secs * 1000).toLocaleString(dateLocale(locale), {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function kindLabel(kind: FileEntryKind, t: (key: string) => string): string {
  switch (kind) {
    case "dir":
      return t("sftp.kind.folder");
    case "file":
      return t("sftp.kind.file");
    case "symlink":
      return t("sftp.kind.link");
  }
}

function EntryIcon({ kind }: { kind: FileEntryKind }) {
  if (kind === "dir")
    return <Folder className="h-4 w-4 shrink-0 fill-primary/20 text-primary" />;
  if (kind === "symlink")
    return <Link2 className="h-4 w-4 shrink-0 text-sky-400" />;
  return <FileIcon className="h-4 w-4 shrink-0 text-muted-foreground" />;
}

/** Editable path field — Enter navigates; blur restores the live listing path. */
export function PathInput({
  path,
  onNavigate,
  disabled,
  placeholder,
}: {
  path: string;
  onNavigate: (path: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [value, setValue] = useState(path);

  useEffect(() => {
    setValue(path);
  }, [path]);

  return (
    <Input
      value={value}
      disabled={disabled}
      placeholder={placeholder}
      spellCheck={false}
      aria-label="Path"
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        const next = value.trim();
        if (next) onNavigate(next);
      }}
      onBlur={() => setValue(path)}
      className="h-7 min-w-0 flex-1 font-mono text-xs"
    />
  );
}

type ActionId =
  | "copy"
  | "rename"
  | "delete"
  | "refresh"
  | "mkdir"
  | "hidden"
  | "permissions"
  | "close";

function ActionsMenu({
  side,
  showHidden,
  hasSelection,
  onAction,
}: {
  side: "local" | "remote";
  showHidden: boolean;
  hasSelection: boolean;
  onAction: (id: ActionId) => void;
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
    id: ActionId;
    label: string;
    destructive?: boolean;
    disabled?: boolean;
    checked?: boolean;
  }[] = [
    { id: "copy", label: t("sftp.actions.copy"), disabled: !hasSelection },
    { id: "rename", label: t("sftp.actions.rename"), disabled: !hasSelection },
    { id: "delete", label: t("sftp.actions.delete"), destructive: true, disabled: !hasSelection },
    { id: "refresh", label: t("sftp.actions.refresh") },
    { id: "mkdir", label: t("sftp.actions.mkdir") },
    { id: "hidden", label: t("sftp.actions.showHidden"), checked: showHidden },
    { id: "permissions", label: t("sftp.actions.permissions"), disabled: !hasSelection },
    ...(side === "remote"
      ? [{ id: "close" as const, label: t("common.close"), destructive: true }]
      : []),
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
        <div className="absolute right-0 top-full z-30 mt-1 min-w-[13rem] overflow-hidden rounded-md border border-border bg-card py-1 shadow-xl">
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
                "group flex w-full items-center px-3 py-2 text-left text-sm transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40",
                item.destructive && "text-destructive hover:text-destructive",
              )}
            >
              <span className={cn("inline-flex min-w-0 flex-1 items-center", HOVER_POP_GROUP)}>
                {item.label}
                {item.checked && (
                  <span className="ml-auto text-xs text-primary">✓</span>
                )}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function FileRow({
  entry,
  selected,
  onSelect,
  onNavigate,
}: {
  entry: FileEntry;
  selected: boolean;
  onSelect: () => void;
  onNavigate: (path: string) => void;
}) {
  const { t, locale } = useI18n();
  const empty = t("common.emptyValue");
  const navigable = entry.kind === "dir" || entry.kind === "symlink";

  return (
    <button
      type="button"
      onClick={onSelect}
      onDoubleClick={navigable ? () => onNavigate(entry.path) : undefined}
      className={cn(
        COLS,
        "group w-full rounded px-2 py-1.5 text-left transition-colors",
        selected ? "bg-primary/15" : "hover:bg-accent/60",
      )}
    >
      <span className={cn("flex min-w-0 items-center gap-2", HOVER_POP_GROUP_SUBTLE)}>
        <EntryIcon kind={entry.kind} />
        <span className="min-w-0">
          <span className="block truncate text-sm">{entry.name}</span>
          <span className="block truncate font-mono text-[10px] leading-tight text-muted-foreground">
            {entry.permissions}
          </span>
        </span>
      </span>
      <span className="truncate text-center text-xs text-muted-foreground">
        {formatDate(entry.modified, locale, empty)}
      </span>
      <span className="text-center text-xs tabular-nums text-muted-foreground">
        {formatSize(entry.size, t)}
      </span>
      <span className="text-center text-xs text-muted-foreground">{kindLabel(entry.kind, t)}</span>
    </button>
  );
}

export function SftpPane({
  side,
  icon: Icon,
  title,
  subtitle,
  listing,
  status,
  error,
  showHidden,
  connected = true,
  emptyState,
  onNavigate,
  onUp,
  onRefresh,
  onAction,
}: {
  side: "local" | "remote";
  icon: LucideIcon;
  title: string;
  subtitle: string;
  listing: FileListing | null;
  status: FsStatus;
  error: string | null;
  showHidden: boolean;
  connected?: boolean;
  emptyState?: React.ReactNode;
  onNavigate: (path: string) => void;
  onUp: () => void;
  onRefresh: () => void;
  onAction: (id: ActionId, selected: FileEntry | null) => void;
}) {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("kind");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const empty = t("common.emptyValue");

  const loading = status === "loading";
  const atRoot = listing?.path === "/";

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const filtered = useMemo(() => {
    if (!listing) return [];
    const q = search.trim().toLowerCase();
    const base = q
      ? listing.entries.filter((e) => e.name.toLowerCase().includes(q))
      : listing.entries;
    const sorted = [...base].sort((a, b) => compareEntries(a, b, sortKey));
    if (sortDir === "desc") sorted.reverse();
    return sorted;
  }, [listing, search, sortKey, sortDir]);

  const selected = listing?.entries.find((e) => e.path === selectedPath) ?? null;

  const fireAction = (id: ActionId) => onAction(id, selected);

  if (!connected) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-card">
        <PaneHeader
          side={side}
          icon={Icon}
          title={title}
          subtitle={subtitle}
          search=""
          onSearchChange={() => undefined}
          showHidden={showHidden}
          hasSelection={false}
          onAction={fireAction}
          searchDisabled
        />
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
          {emptyState}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-card">
      <PaneHeader
        side={side}
        icon={Icon}
        title={title}
        subtitle={subtitle}
        search={search}
        onSearchChange={setSearch}
        showHidden={showHidden}
        hasSelection={!!selected}
        onAction={fireAction}
      />

      {/* Nav bar */}
      <div className="flex shrink-0 items-center gap-1 border-b border-border px-2 py-1.5">
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          disabled={atRoot || !listing}
          aria-label={t("sftp.nav.up")}
          onClick={onUp}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="hover-spin-trigger h-7 w-7"
          aria-label={t("sftp.nav.refresh")}
          disabled={loading}
          onClick={onRefresh}
        >
          <RefreshCw className={cn("h-3.5 w-3.5", loading ? "animate-spin" : "hover-spin-slow")} />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          disabled={atRoot || !listing}
          aria-label={t("sftp.nav.home")}
          onClick={() => onNavigate("/")}
        >
          <HardDrive className="h-3.5 w-3.5" />
        </Button>
        <div className="mx-0.5 h-4 w-px bg-border" />
        {listing ? (
          <PathInput path={listing.path} onNavigate={onNavigate} disabled={loading} />
        ) : (
          <PathInput
            path=""
            onNavigate={onNavigate}
            disabled={loading}
            placeholder={empty}
          />
        )}
      </div>

      {/* Column header — click to sort */}
      <div
        className={cn(
          COLS,
          "shrink-0 border-b border-border px-2 py-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground",
        )}
      >
        <SortHeader
          label={t("sftp.columns.name")}
          col="name"
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={toggleSort}
          className="justify-center rounded px-1 py-0.5 uppercase tracking-wide"
        />
        <SortHeader
          label={t("sftp.columns.dateModified")}
          col="date"
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={toggleSort}
          className="justify-center rounded px-1 py-0.5 uppercase tracking-wide"
        />
        <SortHeader
          label={t("sftp.columns.size")}
          col="size"
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={toggleSort}
          className="justify-center rounded px-1 py-0.5 uppercase tracking-wide"
        />
        <SortHeader
          label={t("sftp.columns.type")}
          col="kind"
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={toggleSort}
          className="justify-center rounded px-1 py-0.5 uppercase tracking-wide"
        />
      </div>

      {/* Scrollable file list — only internal scroll */}
      <div className="relative min-h-0 flex-1 overflow-y-auto p-1">
        {!listing && loading && (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        )}

        {!listing && status === "error" && (
          <div className="space-y-2 p-4 text-center">
            <p className="text-sm text-destructive">{error ?? t("common.error")}</p>
            <Button size="sm" variant="secondary" onClick={onRefresh}>
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
            {error && (
              <p className="px-2 py-1 text-xs text-destructive">{error}</p>
            )}
            <motion.div
              key={listing.path}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.1, ease: "linear" }}
            >
              {!atRoot && (
                <button
                  type="button"
                  onClick={onUp}
                  className={cn(
                    COLS,
                    "group w-full rounded px-2 py-1.5 text-left transition-colors hover:bg-accent/60",
                  )}
                >
                  <span className={cn("flex items-center gap-2", HOVER_POP_GROUP_SUBTLE)}>
                    <CornerLeftUp className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">..</span>
                  </span>
                  <span />
                  <span />
                  <span className="text-xs text-muted-foreground">{t("sftp.entry.parent")}</span>
                </button>
              )}
              {filtered.length === 0 && (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {search ? t("sftp.empty.noMatch") : t("sftp.empty.folder")}
                </p>
              )}
              {filtered.map((entry) => (
                <FileRow
                  key={entry.path}
                  entry={entry}
                  selected={selectedPath === entry.path}
                  onSelect={() => setSelectedPath(entry.path)}
                  onNavigate={onNavigate}
                />
              ))}
            </motion.div>
          </>
        )}
      </div>
    </div>
  );
}

function PaneHeader({
  side,
  icon: Icon,
  title,
  subtitle,
  search,
  onSearchChange,
  showHidden,
  hasSelection,
  onAction,
  searchDisabled,
}: {
  side: "local" | "remote";
  icon: LucideIcon;
  title: string;
  subtitle: string;
  search: string;
  onSearchChange: (v: string) => void;
  showHidden: boolean;
  hasSelection: boolean;
  onAction: (id: ActionId) => void;
  searchDisabled?: boolean;
}) {
  const { t } = useI18n();
  return (
    <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-3 py-2.5">
      <div className="flex min-w-0 items-center gap-2.5">
        <div
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
            side === "local" ? "bg-primary/15 text-primary" : "bg-sky-500/15 text-sky-400",
          )}
        >
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold leading-tight">{title}</p>
          <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <div className="relative w-36">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={t("sftp.search.placeholder")}
            disabled={searchDisabled}
            className="h-8 pl-7 text-xs"
          />
        </div>
        <ActionsMenu
          side={side}
          showHidden={showHidden}
          hasSelection={hasSelection}
          onAction={onAction}
        />
      </div>
    </div>
  );
}

export type { ActionId };

/** Empty-state block for the remote pane when no host is connected. */
export function RemoteConnectPrompt({
  onSelectHost,
}: {
  onSelectHost: () => void;
}) {
  const { t } = useI18n();
  return (
    <>
      <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-muted/50">
        <FolderOpen className="h-7 w-7 text-muted-foreground" />
      </div>
      <div className="space-y-1">
        <p className="text-base font-semibold">{t("sftp.connect.title")}</p>
        <p className="max-w-xs text-sm text-muted-foreground">
          {t("sftp.connect.description")}
        </p>
      </div>
      <Button size="sm" onClick={onSelectHost}>
        {t("common.selectHost")}
      </Button>
    </>
  );
}
