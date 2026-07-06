import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { CenterDialog } from "@/components/ui/center-dialog";
import { useI18n } from "@/hooks/useI18n";
import { cn } from "@/lib/utils";
import { persistSshKeyFile, readLocalKeyFile } from "@/lib/api";

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

/** Unified key dialog: fixed title/description, Browse, paste area, OK. */
export function SshKeyInputPanel({
  kind,
  draft,
  onConfirm,
  onClose,
}: SshKeyInputPanelProps) {
  const { t } = useI18n();
  const fileRef = useRef<HTMLInputElement>(null);

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
  const accept = kind === "public" ? ".pub,text/plain" : "";

  const [text, setText] = useState(draft.text);
  const [path, setPath] = useState(draft.path);
  const [fromFile, setFromFile] = useState(draft.fromFile);
  const [saving, setSaving] = useState(false);
  const [loadingFile, setLoadingFile] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setText(draft.text);
    setPath(draft.path);
    setFromFile(draft.fromFile);
    setError(null);
    setLoadingFile(false);

    if (draft.path && !draft.text.trim()) {
      setLoadingFile(true);
      void readLocalKeyFile(draft.path)
        .then((content) => {
          setText(content.trim());
          setFromFile(true);
        })
        .catch((err) => {
          setError(err instanceof Error ? err.message : String(err));
        })
        .finally(() => setLoadingFile(false));
    }
  }, [kind, draft.path, draft.text, draft.fromFile]);

  const pickFile = () => fileRef.current?.click();

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const filePath = (file as File & { path?: string }).path ?? file.name;
    const reader = new FileReader();
    reader.onload = () => {
      const content =
        typeof reader.result === "string" ? reader.result.trim() : "";
      setText(content);
      setPath(filePath);
      setFromFile(true);
      setError(null);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const onTextChange = (value: string) => {
    setText(value);
    setFromFile(false);
    setPath(null);
    setError(null);
  };

  const hasContent = text.trim().length > 0;

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
    <CenterDialog open onClose={onClose} title={title} className="max-w-sm">
      <div className="space-y-4">
        <p className="text-xs leading-snug text-muted-foreground">{description}</p>

        <input
          ref={fileRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={onFileChange}
        />
        <Button type="button" variant="secondary" className="w-full" onClick={pickFile}>
          {t("common.browse")}
        </Button>

        <textarea
          rows={8}
          placeholder={loadingFile ? t("hosts.sshKey.loading") : placeholder}
          value={text}
          readOnly={fromFile || loadingFile}
          onChange={(e) => onTextChange(e.target.value)}
          className={cn(
            "w-full resize-none rounded-md border border-input bg-background px-3 py-2 font-mono text-xs placeholder:text-muted-foreground",
            fromFile || loadingFile
              ? "cursor-default bg-muted/40 text-muted-foreground"
              : "hover:border-primary/50 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
          spellCheck={false}
        />

        {fromFile && path && (
          <p className="truncate font-mono text-[10px] text-muted-foreground" title={path}>
            {path}
          </p>
        )}

        {error && <p className="text-xs text-destructive">{error}</p>}

        <div className="flex gap-2">
          <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            className="flex-1"
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
