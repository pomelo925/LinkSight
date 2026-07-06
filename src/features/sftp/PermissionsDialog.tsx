import { useEffect, useState } from "react";
import { CenterDialog } from "@/components/ui/center-dialog";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/hooks/useI18n";
import { cn } from "@/lib/utils";
import type { FileEntry } from "@/lib/types";

interface PermTriplet {
  read: boolean;
  write: boolean;
  execute: boolean;
}

interface PermState {
  owner: PermTriplet;
  group: PermTriplet;
  other: PermTriplet;
}

function parseMode(mode: number): PermState {
  return {
    owner: {
      read: (mode & 0o400) !== 0,
      write: (mode & 0o200) !== 0,
      execute: (mode & 0o100) !== 0,
    },
    group: {
      read: (mode & 0o040) !== 0,
      write: (mode & 0o020) !== 0,
      execute: (mode & 0o010) !== 0,
    },
    other: {
      read: (mode & 0o004) !== 0,
      write: (mode & 0o002) !== 0,
      execute: (mode & 0o001) !== 0,
    },
  };
}

function buildMode(state: PermState): number {
  let mode = 0;
  if (state.owner.read) mode |= 0o400;
  if (state.owner.write) mode |= 0o200;
  if (state.owner.execute) mode |= 0o100;
  if (state.group.read) mode |= 0o040;
  if (state.group.write) mode |= 0o020;
  if (state.group.execute) mode |= 0o010;
  if (state.other.read) mode |= 0o004;
  if (state.other.write) mode |= 0o002;
  if (state.other.execute) mode |= 0o001;
  return mode;
}

function PermToggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors duration-150",
        checked ? "bg-primary" : "bg-muted-foreground/30",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-150",
          checked ? "translate-x-[18px]" : "translate-x-0.5",
        )}
      />
    </button>
  );
}

export function PermissionsDialog({
  entry,
  open,
  onClose,
  onSave,
  saving,
}: {
  entry: FileEntry | null;
  open: boolean;
  onClose: () => void;
  onSave: (mode: number) => void;
  saving?: boolean;
}) {
  const { t } = useI18n();
  const [perms, setPerms] = useState<PermState>(() =>
    parseMode(entry?.mode ?? 0o755),
  );

  useEffect(() => {
    if (entry) setPerms(parseMode(entry.mode ?? 0o644));
  }, [entry]);

  if (!entry) return null;

  const rows: { key: keyof PermState; labelKey: string }[] = [
    { key: "owner", labelKey: "sftp.permissions.owner" },
    { key: "group", labelKey: "sftp.permissions.groups" },
    { key: "other", labelKey: "sftp.permissions.others" },
  ];

  const cols: { key: keyof PermTriplet; labelKey: string }[] = [
    { key: "read", labelKey: "sftp.permissions.read" },
    { key: "write", labelKey: "sftp.permissions.write" },
    { key: "execute", labelKey: "sftp.permissions.execute" },
  ];

  const setBit = (
    row: keyof PermState,
    col: keyof PermTriplet,
    value: boolean,
  ) => {
    setPerms((prev) => ({
      ...prev,
      [row]: { ...prev[row], [col]: value },
    }));
  };

  const empty = t("common.emptyValue");

  return (
    <CenterDialog
      open={open}
      onClose={onClose}
      title={t("sftp.permissions.title")}
      className="max-w-md"
    >
      <p className="-mt-1 mb-4 truncate text-xs text-muted-foreground">{entry.path}</p>

      <div className="space-y-1">
        <p className="text-sm font-semibold">{t("sftp.permissions.fileAccess")}</p>
        <div className="overflow-hidden rounded-lg border border-border">
          <div className="grid grid-cols-4 gap-2 border-b border-border bg-muted/30 px-4 py-2 text-xs font-medium text-muted-foreground">
            <span />
            {cols.map((c) => (
              <span key={c.key} className="text-center">
                {t(c.labelKey)}
              </span>
            ))}
          </div>
          {rows.map((row) => (
            <div
              key={row.key}
              className="grid grid-cols-4 items-center gap-2 border-b border-border px-4 py-3 last:border-b-0"
            >
              <span className="text-sm">{t(row.labelKey)}</span>
              {cols.map((col) => (
                <div key={col.key} className="flex justify-center">
                  <PermToggle
                    checked={perms[row.key][col.key]}
                    onChange={(v) => setBit(row.key, col.key, v)}
                  />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-5 space-y-2">
        <p className="text-sm font-semibold">{t("sftp.permissions.ownership")}</p>
        <div className="overflow-hidden rounded-lg border border-border">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <span className="text-sm text-muted-foreground">{t("sftp.permissions.user")}</span>
            <span className="text-sm">{entry.owner ?? entry.uid ?? empty}</span>
          </div>
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-sm text-muted-foreground">{t("sftp.permissions.group")}</span>
            <span className="text-sm">{entry.group ?? entry.gid ?? empty}</span>
          </div>
        </div>
      </div>

      <div className="mt-6 flex justify-end">
        <Button
          size="sm"
          disabled={saving}
          onClick={() => onSave(buildMode(perms))}
        >
          {t("common.save")}
        </Button>
      </div>
    </CenterDialog>
  );
}
