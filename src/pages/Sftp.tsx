import { useCallback, useEffect, useState } from "react";
import { Monitor, Server } from "lucide-react";
import { HostPicker } from "@/features/network/HostPicker";
import {
  SftpPane,
  RemoteConnectPrompt,
  type ActionId,
} from "@/features/sftp/SftpPane";
import { PermissionsDialog } from "@/features/sftp/PermissionsDialog";
import { useHostStore } from "@/store/useHostStore";
import { useHomeStore } from "@/store/useHomeStore";
import { useHostSelection } from "@/hooks/useHostSelection";
import { useI18n } from "@/hooks/useI18n";
import { useLocalFs } from "@/hooks/useLocalFs";
import { useSftp } from "@/hooks/useSftp";
import {
  localMkdir,
  localRemove,
  localRename,
  localSetPermissions,
  sftpDownload,
  sftpMkdir,
  sftpRemove,
  sftpRename,
  sftpSetPermissions,
  sftpUpload,
} from "@/lib/api";
import { isTauri } from "@/lib/tauri";
import type { FileEntry, HostRecord } from "@/lib/types";

function hostEndpoint(h: HostRecord): string {
  const port = h.port != null && h.port > 0 ? `:${h.port}` : "";
  return `${h.username}@${h.ip}${port}`;
}

function joinDirName(dir: string, name: string): string {
  const trimmed = name.trim();
  if (dir === "/") return `/${trimmed}`;
  return `${dir.replace(/\/$/, "")}/${trimmed}`;
}

function hostParams(host: HostRecord) {
  return {
    ip: host.ip,
    port: host.port,
    username: host.username,
    authMode: host.authMode ?? ("ssh" as const),
    password: host.password,
    sshPrivateKeyPath: host.sshPrivateKeyPath,
  };
}

export function Sftp() {
  const { t } = useI18n();
  const selectedHost = useHomeStore((s) => s.selectedHost);
  const selectHost = useHomeStore((s) => s.selectHost);
  const hostsLoad = useHostStore((s) => s.load);
  const selectAndVerify = useHostSelection();

  const {
    listing: localListing,
    status: localStatus,
    error: localError,
    showHidden: localHidden,
    browse: browseLocal,
    setShowHidden: setLocalHidden,
  } = useLocalFs();

  const {
    hostId,
    listing: remoteListing,
    status: remoteStatus,
    error: remoteError,
    showHidden: remoteHidden,
    browse: browseRemote,
    setShowHidden: setRemoteHidden,
    reset: resetRemote,
  } = useSftp();

  const [pickerOpen, setPickerOpen] = useState(false);
  const [permEntry, setPermEntry] = useState<FileEntry | null>(null);
  const [permSide, setPermSide] = useState<"local" | "remote">("local");
  const [permSaving, setPermSaving] = useState(false);

  useEffect(() => {
    if (isTauri()) hostsLoad().catch(() => undefined);
  }, [hostsLoad]);

  useEffect(() => {
    if (isTauri()) void browseLocal(null);
  }, [browseLocal]);

  useEffect(() => {
    if (!isTauri() || !selectedHost) return;
    if (hostId !== selectedHost.id) void browseRemote(selectedHost);
  }, [selectedHost, hostId, browseRemote]);

  const pickHost = (host: HostRecord) => {
    setPickerOpen(false);
    void selectAndVerify(host);
  };

  const refreshLocal = useCallback(() => {
    void browseLocal(localListing?.path ?? null);
  }, [browseLocal, localListing?.path]);

  const refreshRemote = useCallback(() => {
    if (!selectedHost) return;
    void browseRemote(selectedHost, remoteListing?.path ?? null);
  }, [browseRemote, selectedHost, remoteListing?.path]);

  const handleLocalAction = async (id: ActionId, selected: FileEntry | null) => {
    if (!localListing) return;
    switch (id) {
      case "copy":
        if (!selected || selected.kind !== "file" || !selectedHost || !remoteListing) return;
        await sftpUpload({
          ...hostParams(selectedHost),
          localPath: selected.path,
          remoteDir: remoteListing.path,
        });
        refreshRemote();
        break;
      case "rename": {
        if (!selected) return;
        const name = window.prompt(t("sftp.prompt.newName"), selected.name);
        if (!name?.trim() || name === selected.name) return;
        const parent = selected.path.slice(0, selected.path.lastIndexOf("/")) || "/";
        await localRename(selected.path, joinDirName(parent, name));
        refreshLocal();
        break;
      }
      case "delete":
        if (!selected || !window.confirm(t("sftp.confirm.delete", { name: selected.name }))) return;
        await localRemove(selected.path, selected.kind);
        refreshLocal();
        break;
      case "refresh":
        refreshLocal();
        break;
      case "mkdir": {
        const name = window.prompt(t("sftp.prompt.folderName"));
        if (!name?.trim()) return;
        await localMkdir(joinDirName(localListing.path, name));
        refreshLocal();
        break;
      }
      case "hidden": {
        const next = !localHidden;
        setLocalHidden(next);
        void browseLocal(localListing.path);
        break;
      }
      case "permissions":
        if (!selected) return;
        setPermEntry(selected);
        setPermSide("local");
        break;
      default:
        break;
    }
  };

  const handleRemoteAction = async (id: ActionId, selected: FileEntry | null) => {
    if (!selectedHost) return;
    switch (id) {
      case "close":
        selectHost(null);
        resetRemote();
        return;
      case "copy":
        if (!selected || selected.kind !== "file" || !localListing) return;
        await sftpDownload({
          ...hostParams(selectedHost),
          remotePath: selected.path,
          localDir: localListing.path,
        });
        refreshLocal();
        break;
      case "rename": {
        if (!selected) return;
        const name = window.prompt(t("sftp.prompt.newName"), selected.name);
        if (!name?.trim() || name === selected.name) return;
        const parent = selected.path.slice(0, selected.path.lastIndexOf("/")) || "/";
        await sftpRename({
          ...hostParams(selectedHost),
          oldPath: selected.path,
          newPath: joinDirName(parent, name),
        });
        refreshRemote();
        break;
      }
      case "delete":
        if (!selected || !window.confirm(t("sftp.confirm.delete", { name: selected.name }))) return;
        await sftpRemove({
          ...hostParams(selectedHost),
          path: selected.path,
          kind: selected.kind,
        });
        refreshRemote();
        break;
      case "refresh":
        refreshRemote();
        break;
      case "mkdir": {
        if (!remoteListing) return;
        const name = window.prompt(t("sftp.prompt.folderName"));
        if (!name?.trim()) return;
        await sftpMkdir({
          ...hostParams(selectedHost),
          path: joinDirName(remoteListing.path, name),
        });
        refreshRemote();
        break;
      }
      case "hidden": {
        const next = !remoteHidden;
        setRemoteHidden(next);
        if (remoteListing) void browseRemote(selectedHost, remoteListing.path);
        break;
      }
      case "permissions":
        if (!selected) return;
        setPermEntry(selected);
        setPermSide("remote");
        break;
      default:
        break;
    }
  };

  const savePermissions = async (mode: number) => {
    if (!permEntry) return;
    setPermSaving(true);
    try {
      if (permSide === "local") {
        await localSetPermissions(permEntry.path, mode);
        refreshLocal();
      } else if (selectedHost) {
        await sftpSetPermissions({
          ...hostParams(selectedHost),
          path: permEntry.path,
          mode,
        });
        refreshRemote();
      }
      setPermEntry(null);
    } finally {
      setPermSaving(false);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="mb-2 shrink-0">
        <h1 className="text-lg font-semibold tracking-tight">{t("sftp.title")}</h1>
        <p className="text-xs text-muted-foreground">{t("sftp.description")}</p>
      </div>

      <div className="relative flex min-h-0 flex-1 gap-2">
        <SftpPane
          side="local"
          icon={Monitor}
          title={t("common.thisMachine")}
          subtitle="127.0.0.1"
          listing={localListing}
          status={localStatus}
          error={localError}
          showHidden={localHidden}
          onNavigate={(path) => void browseLocal(path)}
          onUp={() =>
            localListing && void browseLocal(`${localListing.path}/..`)
          }
          onRefresh={refreshLocal}
          onAction={(id, sel) => void handleLocalAction(id, sel)}
        />

        <div className="w-px shrink-0 bg-border" aria-hidden />

        <div className="relative flex min-h-0 min-w-0 flex-1">
          <SftpPane
            side="remote"
            icon={Server}
            title={selectedHost ? selectedHost.alias : t("sftp.remote.defaultTitle")}
            subtitle={selectedHost ? hostEndpoint(selectedHost) : t("sftp.remote.notConnected")}
            listing={remoteListing}
            status={remoteStatus}
            error={remoteError}
            showHidden={remoteHidden}
            connected={!!selectedHost}
            emptyState={
              <RemoteConnectPrompt onSelectHost={() => setPickerOpen(true)} />
            }
            onNavigate={(path) =>
              selectedHost && void browseRemote(selectedHost, path)
            }
            onUp={() =>
              selectedHost &&
              remoteListing &&
              void browseRemote(selectedHost, `${remoteListing.path}/..`)
            }
            onRefresh={refreshRemote}
            onAction={(id, sel) => void handleRemoteAction(id, sel)}
          />
          {pickerOpen && (
            <div className="absolute inset-x-0 top-12 z-40 flex justify-center">
              <HostPicker
                onPick={pickHost}
                onClose={() => setPickerOpen(false)}
              />
            </div>
          )}
        </div>
      </div>

      <PermissionsDialog
        entry={permEntry}
        open={!!permEntry}
        onClose={() => setPermEntry(null)}
        onSave={(mode) => void savePermissions(mode)}
        saving={permSaving}
      />
    </div>
  );
}
