import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Box,
  Container,
  Diamond,
  Loader2,
  Monitor,
  MoreVertical,
  Pencil,
  Play,
  RefreshCw,
  RotateCcw,
  Server,
  Square,
  Trash2,
} from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CenterDialog } from "@/components/ui/center-dialog";
import { Input } from "@/components/ui/input";
import { SortHeader } from "@/components/ui/sort-header";
import { HostCircle } from "@/features/network/HostCircle";
import {
  dockerRemoveContainer,
  dockerRemoveImage,
  dockerRenameImage,
  dockerRestartContainer,
  dockerStopContainer,
} from "@/lib/api";
import { useI18n } from "@/hooks/useI18n";
import { HOVER_POP_GROUP, HOVER_POP_STATUS } from "@/lib/interactive";
import { useDockerStore } from "@/store/useDockerStore";
import { useHostStore } from "@/store/useHostStore";
import { isTauri } from "@/lib/tauri";
import { cn } from "@/lib/utils";
import type {
  DockerContainer,
  DockerDiskUsage,
  DockerImage,
  HostDiskUsage,
  HostRecord,
} from "@/lib/types";

/** Image name column: hug longest text up to 20rem, stay as short as possible. */
/** Actions column (⋮ button). */
const ACTIONS_COL_PX = 24;

const COL_MIN_PX = 3 * 16;
const COL_MAX_PX = 20 * 16;
/** Sort chevron + gap inside header buttons. */
const SORT_HEADER_EXTRA_PX = 14;

type HugColSpec = {
  values: string[];
  header: string;
  /** Fixed chrome left of text (icons + gaps). */
  chromePx?: number;
  maxPx?: number;
  minPx?: number;
  mono?: boolean;
  /** Body font size in px (default 14). */
  fontSizePx?: number;
};

function measureTextPx(text: string, font: string): number {
  if (typeof document === "undefined") return text.length * 8;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return text.length * 8;
  ctx.font = font;
  return ctx.measureText(text).width;
}

function uiFontFamily(): string {
  if (typeof document === "undefined") return "ui-sans-serif, system-ui, sans-serif";
  return getComputedStyle(document.body).fontFamily || "ui-sans-serif, system-ui, sans-serif";
}

/** Width from longest cell/header text, capped — columns hug content and stay left-aligned. */
function hugColumnPx(spec: HugColSpec): number {
  const family = uiFontFamily();
  const size = spec.fontSizePx ?? 14;
  const bodyFont = spec.mono
    ? `400 ${size}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`
    : `500 ${size}px ${family}`;
  const headerFont = `500 12px ${family}`;
  let longest = measureTextPx(spec.header, headerFont) + SORT_HEADER_EXTRA_PX;
  for (const value of spec.values) {
    longest = Math.max(longest, measureTextPx(value, bodyFont));
  }
  const chrome = spec.chromePx ?? 0;
  const min = spec.minPx ?? COL_MIN_PX;
  const max = spec.maxPx ?? COL_MAX_PX;
  return Math.min(max, Math.max(min, Math.ceil(longest + chrome + 4)));
}

function hugGridCols(colPx: number[]): number[] {
  return [ACTIONS_COL_PX, ...colPx];
}

/** Fixed gap between columns (Tailwind gap-3). Leftover width expands columns. */
const TABLE_GAP_MIN_PX = 12;

const TABLE_GRID_CLASS = "grid items-center";

/** Horizontal padding on header/rows (`px-4`). */
const TABLE_PAD_X_PX = 16;

type SortDir = "asc" | "desc";
type ContainerSortKey = "name" | "image" | "created" | "cpu" | "mem";
type ImageSortKey = "repository" | "tag" | "size" | "created";

function shortId(id: string): string {
  return id.replace(/^sha256:/, "").slice(0, 12);
}

/** Parse Docker size strings like `28.73GB`, `690.2MiB`, `7.238kB` → bytes. */
function parseDockerSize(raw: string): number {
  const cleaned = raw.trim().split(/\s+/)[0] ?? "";
  const match = cleaned.match(/^([\d.]+)\s*([KMGTPE]?i?B)$/i);
  if (!match) return 0;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return 0;
  const unit = match[2].toUpperCase();
  const binary = unit.includes("I");
  const base = binary ? 1024 : 1000;
  const prefix = unit.replace("IB", "B").replace("B", "");
  const exp =
    prefix === "K" ? 1 : prefix === "M" ? 2 : prefix === "G" ? 3 : prefix === "T" ? 4 : prefix === "P" ? 5 : 0;
  return value * base ** exp;
}

function formatBytesAsGb(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 GB";
  const gb = bytes / 1e9;
  if (gb >= 100) return `${gb.toFixed(0)} GB`;
  if (gb >= 10) return `${gb.toFixed(1)} GB`;
  if (gb >= 1) return `${gb.toFixed(2)} GB`;
  const mb = bytes / 1e6;
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${(bytes / 1e3).toFixed(1)} KB`;
}

/** Numeric GiB for `xx/xx GB` labels (1024-based). */
function formatGbValue(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0";
  const gb = bytes / 1024 ** 3;
  if (gb >= 100) return gb.toFixed(0);
  if (gb >= 10) return gb.toFixed(1);
  if (gb >= 1) return gb.toFixed(2);
  return gb.toFixed(2);
}

function formatGbPair(usedBytes: number, totalBytes: number): string {
  return `${formatGbValue(usedBytes)}/${formatGbValue(totalBytes)} GB`;
}

function parseCreatedMs(raw: string): number {
  const trimmed = raw.trim();
  if (!trimmed) return 0;
  const ms = Date.parse(trimmed);
  return Number.isFinite(ms) ? ms : 0;
}

function parseCpuPerc(raw: string): number {
  const match = raw.trim().match(/^([\d.]+)/);
  if (!match) return 0;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : 0;
}

function parseMemUsedBytes(raw: string): number {
  const used = raw.trim().split("/")[0]?.trim() ?? "";
  return parseDockerSize(used);
}

function compareContainers(
  a: DockerContainer,
  b: DockerContainer,
  key: ContainerSortKey,
): number {
  switch (key) {
    case "name":
      return a.names.localeCompare(b.names, undefined, { sensitivity: "base" });
    case "image":
      return a.image.localeCompare(b.image, undefined, { sensitivity: "base" });
    case "created":
      return parseCreatedMs(a.createdAt) - parseCreatedMs(b.createdAt);
    case "cpu":
      return parseCpuPerc(a.cpuPerc) - parseCpuPerc(b.cpuPerc);
    case "mem":
      return parseMemUsedBytes(a.memUsage) - parseMemUsedBytes(b.memUsage);
  }
}

function compareImages(a: DockerImage, b: DockerImage, key: ImageSortKey): number {
  switch (key) {
    case "repository":
      return a.repository.localeCompare(b.repository, undefined, {
        sensitivity: "base",
      });
    case "tag":
      return a.tag.localeCompare(b.tag, undefined, { sensitivity: "base" });
    case "size":
      return parseDockerSize(a.size) - parseDockerSize(b.size);
    case "created":
      return parseCreatedMs(a.createdAt) - parseCreatedMs(b.createdAt);
  }
}

function formatMemUsage(raw: string, emptyValue: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return emptyValue;
  const parts = trimmed.split("/").map((p) => p.trim());
  if (parts.length !== 2) return trimmed;
  const used = parseDockerSize(parts[0]);
  const total = parseDockerSize(parts[1]);
  if (used <= 0 && total <= 0) return emptyValue;
  const toGiB = (bytes: number) => bytes / 1024 ** 3;
  const fmt = (bytes: number) => {
    const g = toGiB(bytes);
    if (g >= 100) return g.toFixed(0);
    if (g >= 10) return g.toFixed(1);
    return g.toFixed(2);
  };
  return `${fmt(used)}/${fmt(total)} GiB`;
}

function dfTypeLabel(
  typeName: string,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  const key = typeName.toLowerCase();
  if (key.includes("image")) return t("docker.df.type.images");
  if (key.includes("container")) return t("docker.df.type.containers");
  if (key.includes("volume")) return t("docker.df.type.volumes");
  if (key.includes("build")) return t("docker.df.type.buildCache");
  return typeName;
}

function TruncatedCell({
  value,
  className,
  mono,
}: {
  value: string;
  className?: string;
  mono?: boolean;
}) {
  return (
    <div className={cn("min-w-0 overflow-hidden", className)} title={value}>
      <span className={cn("block truncate", mono && "font-mono text-xs")}>{value}</span>
    </div>
  );
}

function PanelHeader({
  title,
  summary,
  loading,
  onRefresh,
  refreshLabel,
}: {
  title: string;
  summary?: string;
  loading?: boolean;
  onRefresh?: () => void;
  refreshLabel?: string;
}) {
  return (
    <CardHeader className="shrink-0 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <CardTitle className="text-base">{title}</CardTitle>
          {onRefresh && refreshLabel && (
            <Button
              size="sm"
              variant="ghost"
              className="hover-spin-trigger h-8 w-8 shrink-0 p-0"
              disabled={loading}
              aria-label={refreshLabel}
              onClick={onRefresh}
            >
              <RefreshCw
                className={cn("h-4 w-4", loading ? "animate-spin" : "hover-spin-slow")}
              />
            </Button>
          )}
        </div>
        {summary && (
          <p className="shrink-0 self-center text-xs text-muted-foreground">
            {summary}
          </p>
        )}
      </div>
    </CardHeader>
  );
}

function statusLabel(state: string, t: (key: string, params?: Record<string, string | number>) => string): string {
  const normalized = state.toLowerCase();
  if (normalized === "running") return t("docker.containers.state.running");
  if (
    normalized === "exited" ||
    normalized === "dead" ||
    normalized === "created" ||
    normalized === "removing" ||
    normalized === "stopped"
  ) {
    return t("docker.containers.state.stopped");
  }
  if (normalized === "paused") return t("docker.containers.state.paused");
  if (normalized === "restarting") return t("docker.containers.state.restarting");
  return t("docker.containers.state.other", { state: state || "unknown" });
}

/** Portaled hover tip so parent overflow never clips the label. */
function usePortaledIconTip(label: string) {
  const triggerRef = useRef<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    setPosition({
      top: rect.top - 4,
      left: rect.right + 2,
    });
  }, []);

  const show = useCallback(() => {
    updatePosition();
    setOpen(true);
  }, [updatePosition]);

  const hide = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onLayoutChange = () => updatePosition();
    window.addEventListener("resize", onLayoutChange);
    window.addEventListener("scroll", onLayoutChange, true);
    return () => {
      window.removeEventListener("resize", onLayoutChange);
      window.removeEventListener("scroll", onLayoutChange, true);
    };
  }, [open, updatePosition]);

  const tooltip =
    open &&
    createPortal(
      <span
        role="tooltip"
        style={{ top: position.top, left: position.left }}
        className="pointer-events-none fixed z-[9999] -translate-y-full whitespace-nowrap rounded-md border border-border bg-card px-1.5 py-0.5 text-[10px] font-medium text-card-foreground shadow-sm"
      >
        {label}
      </span>,
      document.body,
    );

  return { triggerRef, show, hide, tooltip };
}

/** Compact status glyph: play / stop / pause — fixed-size SVG, no hover scale. */
function StatusGlyph({ state }: { state: string }) {
  const { t } = useI18n();
  const normalized = state.toLowerCase();
  const running = normalized === "running";
  const stopped =
    normalized === "exited" ||
    normalized === "dead" ||
    normalized === "created" ||
    normalized === "removing" ||
    normalized === "stopped";
  const label = statusLabel(state, t);
  const tip = usePortaledIconTip(label);

  return (
    <span
      ref={tip.triggerRef}
      className={cn(
        "inline-flex h-5 w-5 shrink-0 cursor-help items-center justify-center",
        HOVER_POP_STATUS,
      )}
      aria-label={label}
      onMouseEnter={tip.show}
      onMouseLeave={tip.hide}
      onFocus={tip.show}
      onBlur={tip.hide}
    >
      {running ? (
        <Play className="h-3.5 w-3.5 fill-emerald-500 text-emerald-500" aria-hidden />
      ) : stopped ? (
        <Square className="h-3 w-3 fill-red-500 text-red-500" aria-hidden />
      ) : (
        <Diamond className="h-3.5 w-3.5 fill-amber-500 text-amber-500" aria-hidden />
      )}
      {tip.tooltip}
    </span>
  );
}

type RowMenuItem = {
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  destructive?: boolean;
  icon: React.ReactNode;
};

function RowActionsMenu({
  items,
  busy,
  disabled,
  ariaLabel,
  onOpenChange,
}: {
  items: RowMenuItem[];
  busy?: boolean;
  disabled?: boolean;
  ariaLabel: string;
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  const setMenuOpen = useCallback(
    (next: boolean) => {
      setOpen(next);
      onOpenChange?.(next);
    },
    [onOpenChange],
  );

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    setPosition({
      top: rect.bottom + 4,
      left: rect.left,
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePosition();
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return;
      }
      setMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    const onLayoutChange = () => updatePosition();
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onLayoutChange);
    window.addEventListener("scroll", onLayoutChange, true);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onLayoutChange);
      window.removeEventListener("scroll", onLayoutChange, true);
    };
  }, [open, setMenuOpen, updatePosition]);

  const menu =
    open &&
    createPortal(
      <div
        ref={menuRef}
        role="menu"
        style={{ top: position.top, left: position.left }}
        className="fixed z-[9999] min-w-[10rem] overflow-hidden rounded-md border border-border bg-card py-1 shadow-md"
      >
        {items.map((item) => (
          <button
            key={item.label}
            type="button"
            role="menuitem"
            disabled={item.disabled}
            className={cn(
              "group flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors",
              "hover:bg-muted disabled:pointer-events-none disabled:opacity-40",
              item.destructive && "text-destructive hover:text-destructive",
            )}
            onClick={() => {
              setMenuOpen(false);
              item.onSelect();
            }}
          >
            <span
              className={cn(
                "inline-flex h-4 w-4 shrink-0 items-center justify-center",
                HOVER_POP_GROUP,
              )}
            >
              {item.icon}
            </span>
            {item.label}
          </button>
        ))}
      </div>,
      document.body,
    );

  return (
    <div className="flex items-center justify-center">
      {busy ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
      ) : (
        <Button
          ref={triggerRef}
          type="button"
          size="sm"
          variant="ghost"
          className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
          disabled={disabled}
          aria-label={ariaLabel}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setMenuOpen(!open)}
        >
          <MoreVertical className="h-3.5 w-3.5" />
        </Button>
      )}
      {menu}
    </div>
  );
}

function ContainerRow({
  container,
  emptyValue,
  busyKey,
  onStop,
  onRestart,
  onRemove,
}: {
  container: DockerContainer;
  emptyValue: string;
  busyKey: string | null;
  onStop: () => void;
  onRestart: () => void;
  onRemove: () => void;
}) {
  const { t } = useI18n();
  const [menuOpen, setMenuOpen] = useState(false);
  const cpu = container.cpuPerc?.trim() || emptyValue;
  const mem = formatMemUsage(container.memUsage ?? "", emptyValue);
  const running = container.state.toLowerCase() === "running";
  const rowBusy = busyKey === container.id;
  const anyBusy = busyKey !== null;

  return (
    <div
      className={cn(
        TABLE_GRID_CLASS,
        "border-b border-border/60 px-4 py-2.5 text-left text-sm last:border-0",
        (menuOpen || rowBusy) && "bg-muted/70",
      )}
      style={{
        gridTemplateColumns: "var(--table-cols)",
        columnGap: "var(--table-gap)",
      }}
    >
      <RowActionsMenu
        busy={rowBusy}
        disabled={anyBusy && !rowBusy}
        ariaLabel={t("docker.containers.col.actions")}
        onOpenChange={setMenuOpen}
        items={[
          {
            label: t("docker.containers.action.stop"),
            disabled: !running || anyBusy,
            icon: <Square className="h-3.5 w-3.5" />,
            onSelect: onStop,
          },
          {
            label: t("docker.containers.action.restart"),
            disabled: anyBusy,
            icon: <RotateCcw className="h-3.5 w-3.5" />,
            onSelect: onRestart,
          },
          {
            label: t("docker.containers.action.remove"),
            disabled: anyBusy,
            destructive: true,
            icon: <Trash2 className="h-3.5 w-3.5" />,
            onSelect: onRemove,
          },
        ]}
      />
      <div className="flex min-w-0 items-center gap-2 overflow-hidden">
        <StatusGlyph state={container.state} />
        <Container className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0">
          <p className="truncate font-medium" title={container.names}>
            {container.names || emptyValue}
          </p>
          <p className="truncate font-mono text-[11px] text-muted-foreground" title={container.id}>
            {shortId(container.id)}
          </p>
        </div>
      </div>
      <TruncatedCell
        value={container.image || emptyValue}
        className="text-muted-foreground"
      />
      <TruncatedCell
        value={container.runningFor || emptyValue}
        className="text-muted-foreground"
      />
      <TruncatedCell value={cpu} className="tabular-nums text-muted-foreground" />
      <TruncatedCell value={mem} className="tabular-nums text-muted-foreground" />
    </div>
  );
}

function ImageRow({
  image,
  emptyValue,
  busyKey,
  onRename,
  onRemove,
}: {
  image: DockerImage;
  emptyValue: string;
  busyKey: string | null;
  onRename: () => void;
  onRemove: () => void;
}) {
  const { t } = useI18n();
  const [menuOpen, setMenuOpen] = useState(false);
  const name = image.repository || emptyValue;
  const tag = image.tag === "<none>" ? emptyValue : image.tag;
  const rowKey = `${image.id}:${image.repository}:${image.tag}`;
  const rowBusy = busyKey === rowKey;
  const anyBusy = busyKey !== null;

  return (
    <div
      className={cn(
        TABLE_GRID_CLASS,
        "border-b border-border/60 px-4 py-2.5 text-left text-sm last:border-0",
        (menuOpen || rowBusy) && "bg-muted/70",
      )}
      style={{
        gridTemplateColumns: "var(--table-cols)",
        columnGap: "var(--table-gap)",
      }}
    >
      <RowActionsMenu
        busy={rowBusy}
        disabled={anyBusy && !rowBusy}
        ariaLabel={t("docker.images.col.actions")}
        onOpenChange={setMenuOpen}
        items={[
          {
            label: t("docker.images.action.rename"),
            disabled: anyBusy,
            icon: <Pencil className="h-3.5 w-3.5" />,
            onSelect: onRename,
          },
          {
            label: t("docker.images.action.remove"),
            disabled: anyBusy,
            destructive: true,
            icon: <Trash2 className="h-3.5 w-3.5" />,
            onSelect: onRemove,
          },
        ]}
      />
      <div className="flex min-w-0 items-center gap-2 overflow-hidden">
        <Box className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0">
          <p className="truncate font-medium" title={name}>
            {name}
          </p>
          <p className="truncate font-mono text-[11px] text-muted-foreground" title={image.id}>
            {shortId(image.id)}
          </p>
        </div>
      </div>
      <TruncatedCell
        value={tag}
        className="text-muted-foreground"
        mono={image.tag !== "<none>"}
      />
      <TruncatedCell value={image.size || emptyValue} className="tabular-nums text-muted-foreground" />
      <TruncatedCell
        value={image.createdSince || emptyValue}
        className="text-muted-foreground"
      />
    </div>
  );
}

const DF_BAR_COLORS = [
  "bg-sky-500",
  "bg-violet-500",
  "bg-emerald-500",
  "bg-amber-500",
] as const;

function UsageBar({
  label,
  amount,
  pct,
  color,
}: {
  label: string;
  /** Shown after the title on the left, e.g. `578/915 GB`. */
  amount?: string;
  pct: number;
  color: string;
}) {
  return (
    <div className="min-w-0 space-y-1.5">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="min-w-0 truncate font-medium">
          {label}
          {amount ? (
            <span className="ml-1.5 font-normal tabular-nums text-muted-foreground">
              {amount}
            </span>
          ) : null}
        </span>
        <span className="shrink-0 tabular-nums text-muted-foreground">
          {pct.toFixed(1)}%
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-[width] duration-300", color)}
          style={{
            width: `${Math.max(pct > 0 ? 1.5 : 0, Math.min(100, pct))}%`,
          }}
        />
      </div>
    </div>
  );
}

function HostDiskBlock({
  disk,
  dockerBytes,
}: {
  disk: HostDiskUsage;
  dockerBytes: number;
}) {
  const { t } = useI18n();
  // Match `df` Use%: Used / (Used + Available). Fall back to Used / Size.
  const capacityBase = disk.usedBytes + disk.availableBytes;
  const usedPct =
    capacityBase > 0
      ? (disk.usedBytes / capacityBase) * 100
      : disk.totalBytes > 0
        ? (disk.usedBytes / disk.totalBytes) * 100
        : 0;
  const dockerPct =
    disk.totalBytes > 0 ? (dockerBytes / disk.totalBytes) * 100 : 0;

  return (
    <div className="min-w-0 space-y-3.5">
      <UsageBar
        label={t("docker.df.host.used")}
        amount={formatGbPair(disk.usedBytes, disk.totalBytes)}
        pct={usedPct}
        color="bg-red-500"
      />
      <UsageBar
        label={t("docker.df.host.docker")}
        amount={formatGbPair(dockerBytes, disk.totalBytes)}
        pct={dockerPct}
        color="bg-orange-500"
      />
    </div>
  );
}

function DiskUsagePanel({
  hostDisks,
  rows,
  loading,
  emptyValue,
}: {
  hostDisks: HostDiskUsage[];
  rows: DockerDiskUsage[];
  loading: boolean;
  emptyValue: string;
}) {
  const { t } = useI18n();

  const dockerTotalBytes = useMemo(
    () => rows.reduce((sum, row) => sum + parseDockerSize(row.size), 0),
    [rows],
  );

  /** Per-disk Docker bytes: prefer backend attribution, else sum of system df on `/` / largest. */
  const diskDockerBytes = useMemo(() => {
    const map = new Map<string, number>();
    if (hostDisks.length === 0) return map;

    const fromBackend = hostDisks.some((d) => d.dockerBytes > 0);
    if (fromBackend) {
      for (const d of hostDisks) map.set(d.name, d.dockerBytes);
      return map;
    }

    // Frontend fallback when backend left dockerBytes at 0.
    const target =
      hostDisks.find((d) => d.mount === "/") ??
      hostDisks.reduce((a, b) => (a.totalBytes >= b.totalBytes ? a : b));
    for (const d of hostDisks) {
      map.set(d.name, d.name === target.name ? dockerTotalBytes : 0);
    }
    return map;
  }, [hostDisks, dockerTotalBytes]);

  const bars = useMemo(() => {
    const parsed = rows.map((row) => ({
      ...row,
      bytes: parseDockerSize(row.size),
    }));
    const total = parsed.reduce((sum, r) => sum + r.bytes, 0);
    return parsed.map((row, i) => ({
      typeName: row.typeName,
      label: dfTypeLabel(row.typeName, t),
      sizeLabel: row.size || emptyValue,
      pct: total > 0 ? (row.bytes / total) * 100 : 0,
      color: DF_BAR_COLORS[i % DF_BAR_COLORS.length],
    }));
  }, [rows, emptyValue, t]);

  if (loading && hostDisks.length === 0 && rows.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">{t("docker.loading")}</p>
    );
  }
  if (hostDisks.length === 0 && rows.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">{t("docker.df.empty")}</p>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
      {hostDisks.length > 0 && (
        <div className="min-w-0 space-y-2.5 rounded-lg border border-border/70 bg-muted/15 px-3 py-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {t("docker.df.host.section")}
          </p>
          <div className="flex flex-col gap-4">
            {hostDisks.map((disk) => (
              <HostDiskBlock
                key={disk.name}
                disk={disk}
                dockerBytes={diskDockerBytes.get(disk.name) ?? 0}
              />
            ))}
          </div>
        </div>
      )}

      {bars.length > 0 && (
        <div className="min-w-0 space-y-2.5 rounded-lg border border-border/70 bg-muted/15 px-3 py-3">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {t("docker.df.host.breakdown")}
            </p>
            <p className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
              {t("docker.df.totalLabel", {
                size: formatBytesAsGb(dockerTotalBytes),
              })}
            </p>
          </div>
          <div className="flex flex-col gap-3.5">
            {bars.map((bar) => (
              <UsageBar
                key={bar.typeName}
                label={bar.label}
                amount={bar.sizeLabel}
                pct={bar.pct}
                color={bar.color}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TableShell({
  colWidths,
  headers,
  children,
  empty,
}: {
  /** Content column widths only (actions column prepended internally). */
  colWidths: number[];
  headers: React.ReactNode[];
  children: React.ReactNode;
  empty?: React.ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const hugCols = useMemo(() => hugGridCols(colWidths), [colWidths]);
  const [liveCols, setLiveCols] = useState(hugCols);

  useEffect(() => {
    setLiveCols(hugCols);
  }, [hugCols]);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;

    const updateLayout = () => {
      const available = Math.max(0, el.clientWidth - TABLE_PAD_X_PX * 2);
      const gaps = Math.max(0, hugCols.length - 1);
      const gapBudget = TABLE_GAP_MIN_PX * gaps;
      const roomForCols = Math.max(0, available - gapBudget);
      const hugTotal = hugCols.reduce((sum, px) => sum + px, 0);

      let next = [...hugCols];

      if (hugTotal > roomForCols && hugTotal > 0) {
        // Shrink to fit — never introduce horizontal scrolling.
        next[0] = ACTIONS_COL_PX;
        const restHug = hugCols.slice(1);
        const restHugTotal = restHug.reduce((s, w) => s + w, 0);
        const roomAfterActions = Math.max(0, roomForCols - ACTIONS_COL_PX);
        if (restHugTotal > 0) {
          const scale = roomAfterActions / restHugTotal;
          for (let i = 0; i < restHug.length; i++) {
            next[i + 1] = Math.max(COL_MIN_PX, Math.floor(restHug[i] * scale));
          }
        }
        const used = next.reduce((s, w) => s + w, 0);
        const drift = roomForCols - used;
        if (next.length > 1 && drift !== 0) {
          next[next.length - 1] = Math.max(COL_MIN_PX, next[next.length - 1] + drift);
        }
      } else {
        // Leftover expands all data columns evenly (0=⋮ stays fixed).
        const extra = roomForCols - hugTotal;
        const growFrom = 1;
        const growable = Math.max(0, next.length - growFrom);
        if (extra > 0 && growable > 0) {
          const each = Math.floor(extra / growable);
          let rem = extra - each * growable;
          for (let i = growFrom; i < next.length; i++) {
            next[i] += each + (rem > 0 ? 1 : 0);
            if (rem > 0) rem -= 1;
          }
        }
      }

      setLiveCols(next);
    };

    updateLayout();
    const ro = new ResizeObserver(updateLayout);
    ro.observe(el);
    return () => ro.disconnect();
  }, [hugCols]);

  if (empty) return <>{empty}</>;

  const gridTemplate = liveCols.map((px) => `${px}px`).join(" ");
  const vars = {
    ["--table-cols" as string]: gridTemplate,
    ["--table-gap" as string]: `${TABLE_GAP_MIN_PX}px`,
  } as React.CSSProperties;

  const rowGridStyle = {
    gridTemplateColumns: "var(--table-cols)",
    columnGap: "var(--table-gap)",
  } as React.CSSProperties;

  return (
    <div
      ref={rootRef}
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-border/60"
      style={vars}
    >
      <div
        className={cn(
          TABLE_GRID_CLASS,
          "shrink-0 items-stretch border-b border-border/60 bg-muted/30 px-4 text-left text-xs font-medium text-muted-foreground",
        )}
        style={rowGridStyle}
      >
        {headers.map((h, i) => (
          <div key={i} className="flex h-full min-h-0 min-w-0 items-stretch">
            {h}
          </div>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">{children}</div>
    </div>
  );
}

type RenameTarget = {
  id: string;
  oldRepository: string;
  oldTag: string;
};

type ConfirmDialog =
  | {
      kind: "stop" | "restart" | "remove-container";
      id: string;
      name: string;
    }
  | {
      kind: "remove-image";
      key: string;
      ref: string;
      name: string;
    };

function hostEndpoint(h: HostRecord): string {
  const port = h.port != null && h.port > 0 ? `:${h.port}` : "";
  return `${h.username}@${h.ip}${port}`;
}

function dockerAuthParams(host: HostRecord | null) {
  if (!host) return null;
  return {
    ip: host.ip,
    port: host.port,
    username: host.username,
    authMode: (host.authMode ?? "ssh") as "ssh" | "password",
    password: host.password,
    sshPrivateKeyPath: host.sshPrivateKeyPath,
  };
}

function DockerHostSelector({
  selectedHost,
  onSelectLocal,
  onSelectHost,
}: {
  selectedHost: HostRecord | null;
  onSelectLocal: () => void;
  onSelectHost: (host: HostRecord) => void;
}) {
  const { t } = useI18n();
  const hosts = useHostStore((s) => s.hosts);
  const [pickerOpen, setPickerOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const circleRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0, width: 0 });

  const updateMenuPos = useCallback(() => {
    const el = circleRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const width = Math.max(rect.width, 16 * 16); // at least 16rem
    const left = rect.left + rect.width / 2 - width / 2;
    setMenuPos({
      top: rect.bottom + 8,
      left: Math.max(8, Math.min(left, window.innerWidth - width - 8)),
      width,
    });
  }, []);

  useEffect(() => {
    if (!pickerOpen) return;
    updateMenuPos();
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return;
      }
      setPickerOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPickerOpen(false);
    };
    const onLayout = () => updateMenuPos();
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onLayout);
    window.addEventListener("scroll", onLayout, true);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onLayout);
      window.removeEventListener("scroll", onLayout, true);
    };
  }, [pickerOpen, updateMenuPos]);

  const menu =
    pickerOpen &&
    createPortal(
      <div
        ref={menuRef}
        style={{ top: menuPos.top, left: menuPos.left, width: menuPos.width }}
        className="fixed z-[9999]"
      >
        <Card className="shadow-lg">
          <CardContent className="p-2">
            <button
              type="button"
              onClick={() => {
                setPickerOpen(false);
                onSelectLocal();
              }}
              className="group flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm hover:bg-accent"
            >
              <span className={cn("inline-flex items-center gap-3", HOVER_POP_GROUP)}>
                <Monitor className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0">
                  <span className="block truncate font-medium">127.0.0.1</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {t("docker.host.localSubtitle")}
                  </span>
                </span>
              </span>
            </button>
            {hosts.length === 0 ? (
              <p className="px-3 py-2 text-center text-xs text-muted-foreground">
                {t("hostPicker.empty")}
              </p>
            ) : (
              <div className="max-h-48 overflow-y-auto border-t border-border/60">
                {hosts.map((h) => (
                  <button
                    key={h.id}
                    type="button"
                    onClick={() => {
                      setPickerOpen(false);
                      onSelectHost(h);
                    }}
                    className="group flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm hover:bg-accent"
                  >
                    <span className={cn("inline-flex items-center gap-3", HOVER_POP_GROUP)}>
                      <Server className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{h.alias}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {hostEndpoint(h)}
                        </span>
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>,
      document.body,
    );

  return (
    <div
      ref={rootRef}
      className="relative z-20 flex min-h-0 min-w-0 flex-1 items-center justify-center self-stretch overflow-visible [container-type:size]"
    >
      <div
        ref={circleRef}
        className="h-[min(100cqw,100cqh)] w-[min(100cqw,100cqh)] shrink-0"
      >
        {selectedHost ? (
          <HostCircle
            size="fill"
            icon={Server}
            title={selectedHost.alias}
            subtitle={hostEndpoint(selectedHost)}
            onClick={() => setPickerOpen((v) => !v)}
          />
        ) : (
          <HostCircle
            size="fill"
            icon={Monitor}
            title="127.0.0.1"
            subtitle={t("docker.host.localSubtitle")}
            onClick={() => setPickerOpen((v) => !v)}
          />
        )}
      </div>
      {menu}
    </div>
  );
}

export function Docker() {
  const { t } = useI18n();
  const data = useDockerStore((s) => s.data);
  const loading = useDockerStore((s) => s.loading);
  const refreshing = useDockerStore((s) => s.refreshing);
  const error = useDockerStore((s) => s.error);
  const load = useDockerStore((s) => s.load);
  const selectedHost = useDockerStore((s) => s.selectedHost);
  const setSelectedHost = useDockerStore((s) => s.setSelectedHost);
  const hostsLoad = useHostStore((s) => s.load);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmDialog | null>(null);
  const [renameTarget, setRenameTarget] = useState<RenameTarget | null>(null);
  const [renameRepo, setRenameRepo] = useState("");
  const [renameTag, setRenameTag] = useState("latest");
  const [containerSortKey, setContainerSortKey] =
    useState<ContainerSortKey>("created");
  const [containerSortDir, setContainerSortDir] = useState<SortDir>("desc");
  const [imageSortKey, setImageSortKey] = useState<ImageSortKey>("created");
  const [imageSortDir, setImageSortDir] = useState<SortDir>("desc");

  useEffect(() => {
    if (isTauri()) void hostsLoad().catch(() => undefined);
  }, [hostsLoad]);

  useEffect(() => {
    void load(selectedHost);
  }, [load, selectedHost]);

  const busy = loading || refreshing;
  const auth = dockerAuthParams(selectedHost);

  const runAction = useCallback(
    async (key: string, action: () => Promise<void>) => {
      setBusyKey(key);
      setActionError(null);
      try {
        await action();
        await load(selectedHost);
      } catch (err) {
        setActionError(
          t("docker.action.failed", {
            error: err instanceof Error ? err.message : String(err),
          }),
        );
      } finally {
        setBusyKey(null);
      }
    },
    [load, selectedHost, t],
  );

  const toggleContainerSort = (key: ContainerSortKey) => {
    if (key === containerSortKey) {
      setContainerSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setContainerSortKey(key);
      setContainerSortDir(key === "created" ? "desc" : "asc");
    }
  };

  const toggleImageSort = (key: ImageSortKey) => {
    if (key === imageSortKey) {
      setImageSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setImageSortKey(key);
      setImageSortDir(key === "created" ? "desc" : "asc");
    }
  };

  const sortedContainers = useMemo(() => {
    const rows = [...data.containers];
    rows.sort((a, b) => compareContainers(a, b, containerSortKey));
    if (containerSortDir === "desc") rows.reverse();
    return rows;
  }, [data.containers, containerSortKey, containerSortDir]);

  const sortedImages = useMemo(() => {
    const rows = [...data.images];
    rows.sort((a, b) => compareImages(a, b, imageSortKey));
    if (imageSortDir === "desc") rows.reverse();
    return rows;
  }, [data.images, imageSortKey, imageSortDir]);

  const emptyValue = t("common.emptyValue");

  const containersColWidths = useMemo(() => {
    // status (20) + gap (8) + container icon (20) + gap (8)
    const nameChrome = 20 + 8 + 20 + 8;
    const nameValues = sortedContainers.flatMap((c) => [
      c.names || emptyValue,
      shortId(c.id),
    ]);
    return [
      hugColumnPx({
        values: nameValues,
        header: t("docker.containers.col.name"),
        chromePx: nameChrome,
        fontSizePx: 14,
      }),
      hugColumnPx({
        values: sortedContainers.map((c) => c.image || emptyValue),
        header: t("docker.containers.col.image"),
      }),
      hugColumnPx({
        values: sortedContainers.map((c) => c.runningFor || emptyValue),
        header: t("docker.containers.col.created"),
      }),
      hugColumnPx({
        values: sortedContainers.map((c) => c.cpuPerc?.trim() || emptyValue),
        header: t("docker.containers.col.cpu"),
        mono: true,
      }),
      hugColumnPx({
        values: sortedContainers.map((c) =>
          formatMemUsage(c.memUsage ?? "", emptyValue),
        ),
        header: t("docker.containers.col.mem"),
        mono: true,
      }),
    ];
  }, [sortedContainers, emptyValue, t]);

  const imagesColWidths = useMemo(() => {
    // box icon (20) + gap (8)
    const repoChrome = 20 + 8;
    const repoValues = sortedImages.flatMap((img) => [
      img.repository || emptyValue,
      shortId(img.id),
    ]);
    return [
      hugColumnPx({
        values: repoValues,
        header: t("docker.images.col.repository"),
        chromePx: repoChrome,
      }),
      hugColumnPx({
        values: sortedImages.map((img) =>
          img.tag === "<none>" ? emptyValue : img.tag,
        ),
        header: t("docker.images.col.tag"),
        mono: true,
        fontSizePx: 12,
      }),
      hugColumnPx({
        values: sortedImages.map((img) => img.size || emptyValue),
        header: t("docker.images.col.size"),
        mono: true,
      }),
      hugColumnPx({
        values: sortedImages.map((img) => img.createdSince || emptyValue),
        header: t("docker.images.col.created"),
      }),
    ];
  }, [sortedImages, emptyValue, t]);
  const hasData =
    data.containers.length > 0 ||
    data.images.length > 0 ||
    data.diskUsage.length > 0 ||
    data.hostDisks.length > 0;

  const confirmCopy = (() => {
    if (!confirm) return null;
    switch (confirm.kind) {
      case "stop":
        return {
          title: t("docker.containers.confirm.stop.title"),
          body: t("docker.containers.confirm.stop", { name: confirm.name }),
          hint: null as string | null,
          destructive: false,
          actionLabel: t("docker.containers.action.stop"),
        };
      case "restart":
        return {
          title: t("docker.containers.confirm.restart.title"),
          body: t("docker.containers.confirm.restart", { name: confirm.name }),
          hint: null as string | null,
          destructive: false,
          actionLabel: t("docker.containers.action.restart"),
        };
      case "remove-container":
        return {
          title: t("docker.containers.confirm.remove.title"),
          body: t("docker.containers.confirm.remove", { name: confirm.name }),
          hint: t("docker.containers.confirm.remove.hint"),
          destructive: true,
          actionLabel: t("docker.containers.action.remove"),
        };
      case "remove-image":
        return {
          title: t("docker.images.confirm.remove.title"),
          body: t("docker.images.confirm.remove", { name: confirm.name }),
          hint: t("docker.images.confirm.remove.hint"),
          destructive: true,
          actionLabel: t("docker.images.action.remove"),
        };
    }
  })();

  const executeConfirm = () => {
    if (!confirm) return;
    const pending = confirm;
    setConfirm(null);
    switch (pending.kind) {
      case "stop":
        void runAction(pending.id, () => dockerStopContainer(pending.id, auth));
        break;
      case "restart":
        void runAction(pending.id, () => dockerRestartContainer(pending.id, auth));
        break;
      case "remove-container":
        void runAction(pending.id, () => dockerRemoveContainer(pending.id, auth));
        break;
      case "remove-image":
        void runAction(pending.key, () => dockerRemoveImage(pending.ref, auth));
        break;
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
      <PageHeader
        className="mb-0 shrink-0"
        title={t("docker.title")}
        description={t("docker.description")}
      />

      {(error || actionError) && (
        <div className="shrink-0 space-y-2 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3">
          <p className="text-sm text-destructive">{error || actionError}</p>
          {error && (
            <p className="text-xs text-muted-foreground">{t("docker.error.hint")}</p>
          )}
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setActionError(null);
              void load(selectedHost);
            }}
          >
            {t("common.retry")}
          </Button>
        </div>
      )}

      {/* Top: host selector (~25%) + containers (~75%), same row height */}
      <div className="flex min-h-0 flex-1 gap-3 overflow-hidden">
        <DockerHostSelector
          selectedHost={selectedHost}
          onSelectLocal={() => setSelectedHost(null)}
          onSelectHost={(host) => setSelectedHost(host)}
        />

        <Card className="flex min-h-0 min-w-0 flex-[3] flex-col overflow-hidden">
          <PanelHeader
            title={t("docker.containers.title")}
            summary={
              error
                ? undefined
                : loading && !hasData
                  ? t("docker.loading")
                  : t("docker.containers.summary", { count: data.containers.length })
            }
            loading={busy}
            onRefresh={() => void load(selectedHost)}
            refreshLabel={t("docker.refresh")}
          />
          <CardContent className="flex min-h-0 flex-1 flex-col overflow-hidden pt-0">
            <TableShell
              colWidths={containersColWidths}
              headers={[
                null,
                <SortHeader
                  key="name"
                  label={t("docker.containers.col.name")}
                  col="name"
                  sortKey={containerSortKey}
                  sortDir={containerSortDir}
                  onSort={toggleContainerSort}
                />,
                <SortHeader
                  key="image"
                  label={t("docker.containers.col.image")}
                  col="image"
                  sortKey={containerSortKey}
                  sortDir={containerSortDir}
                  onSort={toggleContainerSort}
                />,
                <SortHeader
                  key="created"
                  label={t("docker.containers.col.created")}
                  col="created"
                  sortKey={containerSortKey}
                  sortDir={containerSortDir}
                  onSort={toggleContainerSort}
                />,
                <SortHeader
                  key="cpu"
                  label={t("docker.containers.col.cpu")}
                  col="cpu"
                  sortKey={containerSortKey}
                  sortDir={containerSortDir}
                  onSort={toggleContainerSort}
                />,
                <SortHeader
                  key="mem"
                  label={t("docker.containers.col.mem")}
                  col="mem"
                  sortKey={containerSortKey}
                  sortDir={containerSortDir}
                  onSort={toggleContainerSort}
                />,
              ]}
              empty={
                error || (!loading && !refreshing && data.containers.length === 0) ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    {t("docker.containers.empty")}
                  </p>
                ) : loading && data.containers.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    {t("docker.loading")}
                  </p>
                ) : undefined
              }
            >
              {sortedContainers.map((container) => (
                <ContainerRow
                  key={container.id}
                  container={container}
                  emptyValue={emptyValue}
                  busyKey={busyKey}
                  onStop={() =>
                    setConfirm({
                      kind: "stop",
                      id: container.id,
                      name: container.names,
                    })
                  }
                  onRestart={() =>
                    setConfirm({
                      kind: "restart",
                      id: container.id,
                      name: container.names,
                    })
                  }
                  onRemove={() =>
                    setConfirm({
                      kind: "remove-container",
                      id: container.id,
                      name: container.names,
                    })
                  }
                />
              ))}
            </TableShell>
          </CardContent>
        </Card>
      </div>

      {/* Bottom: disk usage (~25%) + images (~75%) */}
      <div className="flex min-h-0 flex-1 gap-3 overflow-hidden">
        <Card className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <PanelHeader
            title={t("docker.df.title")}
            summary={
              error
                ? undefined
                : loading && data.diskUsage.length === 0 && data.hostDisks.length === 0
                  ? t("docker.loading")
                  : undefined
            }
            loading={busy}
            onRefresh={() => void load(selectedHost)}
            refreshLabel={t("docker.refresh")}
          />
          <CardContent className="flex min-h-0 flex-1 flex-col overflow-hidden pt-0">
            <DiskUsagePanel
              hostDisks={data.hostDisks}
              rows={data.diskUsage}
              loading={loading}
              emptyValue={emptyValue}
            />
          </CardContent>
        </Card>

        <Card className="flex min-h-0 min-w-0 flex-[3] flex-col overflow-hidden">
          <PanelHeader
            title={t("docker.images.title")}
            summary={
              error
                ? undefined
                : loading && !hasData
                  ? t("docker.loading")
                  : t("docker.images.summary", { count: data.images.length })
            }
            loading={busy}
            onRefresh={() => void load(selectedHost)}
            refreshLabel={t("docker.refresh")}
          />
          <CardContent className="flex min-h-0 flex-1 flex-col overflow-hidden pt-0">
            <TableShell
              colWidths={imagesColWidths}
              headers={[
                null,
                <SortHeader
                  key="repository"
                  label={t("docker.images.col.repository")}
                  col="repository"
                  sortKey={imageSortKey}
                  sortDir={imageSortDir}
                  onSort={toggleImageSort}
                />,
                <SortHeader
                  key="tag"
                  label={t("docker.images.col.tag")}
                  col="tag"
                  sortKey={imageSortKey}
                  sortDir={imageSortDir}
                  onSort={toggleImageSort}
                />,
                <SortHeader
                  key="size"
                  label={t("docker.images.col.size")}
                  col="size"
                  sortKey={imageSortKey}
                  sortDir={imageSortDir}
                  onSort={toggleImageSort}
                />,
                <SortHeader
                  key="created"
                  label={t("docker.images.col.created")}
                  col="created"
                  sortKey={imageSortKey}
                  sortDir={imageSortDir}
                  onSort={toggleImageSort}
                />,
              ]}
              empty={
                error || (!loading && !refreshing && data.images.length === 0) ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    {t("docker.images.empty")}
                  </p>
                ) : loading && data.images.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    {t("docker.loading")}
                  </p>
                ) : undefined
              }
            >
              {sortedImages.map((image) => {
                const rowKey = `${image.id}:${image.repository}:${image.tag}`;
                const displayName =
                  image.repository && image.tag && image.tag !== "<none>"
                    ? `${image.repository}:${image.tag}`
                    : image.repository || shortId(image.id);
                return (
                  <ImageRow
                    key={rowKey}
                    image={image}
                    emptyValue={emptyValue}
                    busyKey={busyKey}
                    onRename={() => {
                      setRenameTarget({
                        id: image.id,
                        oldRepository: image.repository,
                        oldTag: image.tag,
                      });
                      setRenameRepo(
                        image.repository === "<none>" ? "" : image.repository,
                      );
                      setRenameTag(image.tag === "<none>" ? "latest" : image.tag);
                    }}
                    onRemove={() => {
                      const ref =
                        image.repository !== "<none>" && image.tag !== "<none>"
                          ? `${image.repository}:${image.tag}`
                          : image.id;
                      setConfirm({
                        kind: "remove-image",
                        key: rowKey,
                        ref,
                        name: displayName,
                      });
                    }}
                  />
                );
              })}
            </TableShell>
          </CardContent>
        </Card>
      </div>

      <CenterDialog
        open={confirm !== null && confirmCopy !== null}
        onClose={() => setConfirm(null)}
        title={confirmCopy?.title ?? ""}
      >
        <div className="space-y-4">
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>{confirmCopy?.body}</p>
            {confirmCopy?.hint && <p>{confirmCopy.hint}</p>}
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setConfirm(null)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant={confirmCopy?.destructive ? "destructive" : "default"}
              onClick={executeConfirm}
            >
              {confirmCopy?.actionLabel ?? t("docker.confirm")}
            </Button>
          </div>
        </div>
      </CenterDialog>

      <CenterDialog
        open={renameTarget !== null}
        onClose={() => setRenameTarget(null)}
        title={t("docker.images.rename.title")}
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!renameTarget) return;
            const repository = renameRepo.trim();
            const tag = renameTag.trim() || "latest";
            if (!repository) return;
            const key = `${renameTarget.id}:${renameTarget.oldRepository}:${renameTarget.oldTag}`;
            setRenameTarget(null);
            void runAction(key, () =>
              dockerRenameImage(
                {
                  id: renameTarget.id,
                  oldRepository: renameTarget.oldRepository,
                  oldTag: renameTarget.oldTag,
                  repository,
                  tag,
                },
                auth,
              ),
            );
          }}
        >
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">
              {t("docker.images.rename.repository")}
            </label>
            <Input
              value={renameRepo}
              onChange={(e) => setRenameRepo(e.target.value)}
              autoFocus
              required
              placeholder="my-image"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">
              {t("docker.images.rename.tag")}
            </label>
            <Input
              value={renameTag}
              onChange={(e) => setRenameTag(e.target.value)}
              placeholder="latest"
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setRenameTarget(null)}
            >
              {t("common.cancel")}
            </Button>
            <Button type="submit" size="sm" disabled={!renameRepo.trim()}>
              {t("docker.images.rename.submit")}
            </Button>
          </div>
        </form>
      </CenterDialog>
    </div>
  );
}
