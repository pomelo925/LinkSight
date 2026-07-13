import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { CenterDialog } from "@/components/ui/center-dialog";
import { LocalKeyFsBrowser } from "@/features/hosts/LocalKeyFsBrowser";
import { useI18n } from "@/hooks/useI18n";
import { cn } from "@/lib/utils";
import { persistSshKeyFile, readLocalKeyFile } from "@/lib/api";
import type { FileEntry } from "@/lib/types";

export type SshKeyPanelKind = "private" | "public";

/** Draft for a key field — path when from file browse, text always holds display content. */
export interface SshKeyDraft {
  path: string | null;
  text: string;
  fromFile: boolean;
}

export const EMPTY_KEY_DRAFT: SshKeyDraft = {
  path: null,
  text: "",
  fromFile: false,
};

interface SshKeyInputPanelProps {
  kind: SshKeyPanelKind;
  draft: SshKeyDraft;
  onConfirm: (draft: SshKeyDraft) => void;
  onClose: () => void;
}

/** Large dual-pane key dialog: local file browser + editable key text + OK/Cancel. */
export function SshKeyInputPanel({
  kind,
  draft,
  onConfirm,
  onClose,
}: SshKeyInputPanelProps) {
  const { t } = useI18n();

  const title =
    kind === "private" ? t("hosts.sshKey.private.title") : t("hosts.sshKey.public.title");
  const description =
    kind === "private"
      ? t("hosts.sshKey.private.description")
      : t("hosts.sshKey.public.description");
  const placeholder =
    kind === "private"
      ? t("hosts.sshKey.private.placeholder")
      : t("hosts.sshKey.public.placeholder");

  const [text, setText] = useState(draft.text);
  const [path, setPath] = useState(draft.path);
  const [fromFile, setFromFile] = useState(draft.fromFile);
  /** Exact contents last loaded from disk — used for pristine (gray) vs edited (white). */
  const [sourceText, setSourceText] = useState<string | null>(
    draft.fromFile && draft.text.trim() ? draft.text.trim() : null,
  );
  const [sourcePath, setSourcePath] = useState<string | null>(draft.fromFile ? draft.path : null);
  const [saving, setSaving] = useState(false);
  const [loadingFile, setLoadingFile] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setText(draft.text);
    setPath(draft.path);
    setFromFile(draft.fromFile);
    setSourceText(draft.fromFile && draft.text.trim() ? draft.text.trim() : null);
    setSourcePath(draft.fromFile ? draft.path : null);
    setError(null);
    setLoadingFile(false);

    if (draft.path && !draft.text.trim()) {
      setLoadingFile(true);
      void readLocalKeyFile(draft.path)
        .then((content) => {
          const trimmed = content.trim();
          setText(trimmed);
          setSourceText(trimmed);
          setSourcePath(draft.path);
          setFromFile(true);
        })
        .catch((err) => {
          setError(err instanceof Error ? err.message : String(err));
        })
        .finally(() => setLoadingFile(false));
    }
  }, [kind, draft.path, draft.text, draft.fromFile]);

  const loadFile = async (entry: FileEntry) => {
    setLoadingFile(true);
    setError(null);
    try {
      const content = (await readLocalKeyFile(entry.path)).trim();
      setText(content);
      setPath(entry.path);
      setSourceText(content);
      setSourcePath(entry.path);
      setFromFile(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingFile(false);
    }
  };

  const onTextChange = (value: string) => {
    setText(value);
    setError(null);
    // Reverted to the loaded file → treat as pristine again.
    if (sourceText !== null && value === sourceText) {
      setFromFile(true);
      setPath(sourcePath);
      return;
    }
    // Edited (or free-typed paste) → commit path will persist on OK if private.
    setFromFile(false);
    setPath(null);
  };

  const hasContent = text.trim().length > 0;
  const showingOriginal = !loadingFile && sourceText !== null && text === sourceText;

  const handleOk = async () => {
    if (!hasContent) return;
    setSaving(true);
    setError(null);
    try {
      let resolvedPath = path;
      if (kind === "private" && !fromFile) {
        resolvedPath = await persistSshKeyFile(text.trim());
      }
      onConfirm({
        path: resolvedPath,
        text: text.trim(),
        fromFile,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  };

  return (
    <CenterDialog
      open
      onClose={onClose}
      title={title}
      className="flex h-[min(85vh,40rem)] w-full max-w-5xl flex-col"
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0 pt-2"
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3 px-5 pb-4">
        <p className="shrink-0 text-xs leading-snug text-muted-foreground">{description}</p>

        <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-2">
          <div className="min-h-0 min-w-0">
            <LocalKeyFsBrowser onPickFile={(entry) => void loadFile(entry)} />
          </div>

          <div className="flex min-h-0 min-w-0 flex-col gap-2">
            <div className="flex shrink-0 items-baseline justify-between gap-2">
              <p className="text-sm font-semibold">{t("hosts.sshKey.input.title")}</p>
              {fromFile && path && (
                <p
                  className="max-w-[60%] truncate font-mono text-[10px] text-muted-foreground"
                  title={path}
                >
                  {path}
                </p>
              )}
            </div>
            <textarea
              placeholder={loadingFile ? t("hosts.sshKey.loading") : placeholder}
              value={text}
              disabled={loadingFile}
              onChange={(e) => onTextChange(e.target.value)}
              className={cn(
                "min-h-0 w-full flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 font-mono text-xs placeholder:text-muted-foreground",
                "hover:border-primary/50 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                loadingFile && "cursor-wait bg-muted/40",
                showingOriginal || loadingFile
                  ? "text-muted-foreground"
                  : "text-foreground",
              )}
              spellCheck={false}
            />
          </div>
        </div>

        {error && <p className="shrink-0 text-xs text-destructive">{error}</p>}

        <div className="flex shrink-0 justify-end gap-2 border-t border-border pt-3">
          <Button type="button" variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            disabled={!hasContent || saving || loadingFile}
            onClick={() => void handleOk()}
          >
            {saving ? t("common.saving") : t("common.ok")}
          </Button>
        </div>
      </div>
    </CenterDialog>
  );
}

export function keySummary(draft: SshKeyDraft): string {
  if (draft.fromFile && draft.path) {
    return draft.path.split("/").pop() ?? draft.path;
  }
  const line = draft.text.trim().split("\n")[0] ?? "";
  if (!line) return "";
  return line.length > 36 ? `${line.slice(0, 36)}…` : line;
}

export function authDraftToRecord(
  authMode: "ssh" | "password",
  privateDraft: SshKeyDraft,
  publicDraft: SshKeyDraft,
  firstTimeDeploy: boolean,
): {
  authMode: "ssh" | "password";
  sshPrivateKeyPath: string | null;
  sshPublicKey: string | null;
} {
  if (authMode === "password") {
    return { authMode, sshPrivateKeyPath: null, sshPublicKey: null };
  }
  return {
    authMode,
    sshPrivateKeyPath: privateDraft.path?.trim() || null,
    sshPublicKey: firstTimeDeploy ? publicDraft.text.trim() || null : null,
  };
}

export function authDraftFromRecord(host: {
  authMode?: string | null;
  sshPrivateKeyPath: string | null;
  sshPublicKey: string | null;
  password?: string | null;
}): {
  authMode: "ssh" | "password";
  privateDraft: SshKeyDraft;
  publicDraft: SshKeyDraft;
  firstTimeDeploy: boolean;
} {
  const authMode = host.authMode === "password" ? "password" : "ssh";
  const firstTimeDeploy = !!(host.password?.trim() || host.sshPublicKey?.trim());
  return {
    authMode,
    privateDraft: host.sshPrivateKeyPath
      ? { path: host.sshPrivateKeyPath, text: "", fromFile: true }
      : { ...EMPTY_KEY_DRAFT },
    publicDraft: host.sshPublicKey
      ? { path: null, text: host.sshPublicKey, fromFile: false }
      : { ...EMPTY_KEY_DRAFT },
    firstTimeDeploy,
  };
}
