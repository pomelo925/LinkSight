import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Plus, Server, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useHostStore } from "@/store/useHostStore";
import { useI18n } from "@/hooks/useI18n";
import { cn } from "@/lib/utils";
import { HostEditor } from "@/features/hosts/HostEditor";
import {
  SshKeyInputPanel,
  authDraftFromRecord,
  EMPTY_KEY_DRAFT,
  type SshKeyDraft,
  type SshKeyPanelKind,
} from "@/features/hosts/SshAuthPanels";
import type { HostRecord } from "@/lib/types";

const EMPTY_HOST: HostRecord = {
  id: "",
  alias: "",
  hostname: null,
  username: "",
  ip: "",
  password: null,
  port: null,
  authMode: "ssh",
  sshPrivateKeyPath: null,
  sshPublicKey: null,
};

/** Fixed card width — only reflows to next row, never stretches/shrinks. */
const HOST_CARD_W = "17.5rem";

const drawerEase = [0.32, 0.72, 0, 1] as const;

function formatHostEndpoint(h: HostRecord): string {
  const port = h.port != null && h.port > 0 ? `:${h.port}` : "";
  return `${h.username}@${h.ip}${port}`;
}

export function Hosts() {
  const { t } = useI18n();
  const hosts = useHostStore((s) => s.hosts);
  const loaded = useHostStore((s) => s.loaded);
  const load = useHostStore((s) => s.load);
  const save = useHostStore((s) => s.save);
  const remove = useHostStore((s) => s.remove);

  const [editing, setEditing] = useState<HostRecord | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [keyPanel, setKeyPanel] = useState<SshKeyPanelKind | null>(null);
  const [privateKeyDraft, setPrivateKeyDraft] = useState<SshKeyDraft>(EMPTY_KEY_DRAFT);
  const [publicKeyDraft, setPublicKeyDraft] = useState<SshKeyDraft>(EMPTY_KEY_DRAFT);
  const [firstTimeDeploy, setFirstTimeDeploy] = useState(false);

  useEffect(() => {
    load().catch((err) =>
      setLoadError(err instanceof Error ? err.message : String(err)),
    );
  }, [load]);

  const openEditor = (host: HostRecord) => {
    const draft = authDraftFromRecord(host);
    setEditing({ ...host, authMode: draft.authMode });
    setPrivateKeyDraft(draft.privateDraft);
    setPublicKeyDraft(draft.publicDraft);
    setFirstTimeDeploy(draft.firstTimeDeploy);
    setKeyPanel(null);
  };

  const closeEditor = () => {
    setEditing(null);
    setKeyPanel(null);
  };

  const handleSave = async (host: HostRecord) => {
    await save(host);
    closeEditor();
  };

  const handleKeyConfirm = (kind: SshKeyPanelKind, draft: SshKeyDraft) => {
    if (kind === "private") setPrivateKeyDraft(draft);
    else setPublicKeyDraft(draft);
    setKeyPanel(null);
  };

  return (
    <>
      <div className="-mx-8 relative flex h-[calc(100vh-4rem)]">
        <div
          className={cn(
            "min-w-0 flex-1 space-y-4 overflow-y-auto px-8 pb-4",
            editing && "pr-80",
          )}
        >
          <PageHeader title={t("hosts.title")} description={t("hosts.description")} />

          <Button onClick={() => openEditor({ ...EMPTY_HOST })}>
            <Plus className="h-4 w-4" />
            {t("hosts.actions.newHost")}
          </Button>

          {loadError && (
            <Card>
              <CardContent className="py-4 text-sm text-destructive">
                {loadError}
              </CardContent>
            </Card>
          )}

          {loaded && hosts.length === 0 && !loadError ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                {t("hosts.empty")}
              </CardContent>
            </Card>
          ) : (
            <div
              className="grid justify-start gap-3"
              style={{
                gridTemplateColumns: `repeat(auto-fill, minmax(${HOST_CARD_W}, 1fr))`,
              }}
            >
              {hosts.map((h) => (
                <Card
                  key={h.id}
                  className="w-[17.5rem] cursor-pointer hover:border-primary/60"
                  onClick={() => openEditor(h)}
                >
                  <CardContent className="flex items-center justify-between gap-3 py-4">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Server className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-medium">{h.alias}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {formatHostEndpoint(h)}
                          {h.authMode === "password"
                            ? ` · ${t("hosts.authMode.password")}`
                            : ` · ${t("hosts.authMode.ssh")}`}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={t("hosts.actions.deleteHost", { alias: h.alias })}
                      onClick={(e) => {
                        e.stopPropagation();
                        void remove(h.id);
                        if (editing?.id === h.id) closeEditor();
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        <AnimatePresence initial={false}>
          {editing && (
            <motion.aside
              key="host-editor-drawer"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ duration: 0.18, ease: drawerEase }}
              className="absolute inset-y-0 right-0 z-10 w-80 overflow-hidden rounded-l-lg border-y border-l border-border bg-card shadow-lg"
              style={{ willChange: "transform" }}
            >
              <div className="h-full w-80">
                <HostEditor
                  key={editing.id || "new"}
                  host={editing}
                  onSave={handleSave}
                  onClose={closeEditor}
                  keyPanel={keyPanel}
                  onKeyPanelChange={setKeyPanel}
                  privateKeyDraft={privateKeyDraft}
                  publicKeyDraft={publicKeyDraft}
                  firstTimeDeploy={firstTimeDeploy}
                  onFirstTimeDeployChange={setFirstTimeDeploy}
                />
              </div>
            </motion.aside>
          )}
        </AnimatePresence>
      </div>

      {keyPanel && editing && (
        <SshKeyInputPanel
          kind={keyPanel}
          draft={keyPanel === "private" ? privateKeyDraft : publicKeyDraft}
          onConfirm={(d) => handleKeyConfirm(keyPanel, d)}
          onClose={() => setKeyPanel(null)}
        />
      )}
    </>
  );
}
