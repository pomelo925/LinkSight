import { useLayoutEffect, useRef, useState } from "react";
import { ShieldCheck, Loader2, X, Save, FileKey, KeyRound } from "lucide-react";
import { InfoHint } from "@/components/ui/info-hint";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  verifyHost,
  validateSshPrivateKey,
  validateSshPublicKey,
} from "@/lib/api";
import { useI18n } from "@/hooks/useI18n";
import { formatMs, cn } from "@/lib/utils";
import type {
  HostRecord,
  PrivateKeyValidation,
  PublicKeyValidation,
  VerifyResult,
} from "@/lib/types";
import { FieldTrigger } from "./FieldTrigger";
import {
  authDraftToRecord,
  keySummary,
  type SshKeyDraft,
  type SshKeyPanelKind,
} from "./SshAuthPanels";

interface Props {
  host: HostRecord;
  onSave: (host: HostRecord) => Promise<void>;
  onClose: () => void;
  keyPanel: SshKeyPanelKind | null;
  onKeyPanelChange: (panel: SshKeyPanelKind | null) => void;
  privateKeyDraft: SshKeyDraft;
  publicKeyDraft: SshKeyDraft;
  firstTimeDeploy: boolean;
  onFirstTimeDeployChange: (value: boolean) => void;
}

/** Termius-style side panel for creating / editing a saved host. */
export function HostEditor({
  host,
  onSave,
  onClose,
  keyPanel,
  onKeyPanelChange,
  privateKeyDraft,
  publicKeyDraft,
  firstTimeDeploy,
  onFirstTimeDeployChange,
}: Props) {
  const { t } = useI18n();
  const [form, setForm] = useState<HostRecord>({ ...host });
  const [portText, setPortText] = useState(
    host.port != null && host.port > 0 ? String(host.port) : "",
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [verifying, setVerifying] = useState(false);
  const [verify, setVerify] = useState<VerifyResult | null>(null);
  const [privateKeyValidation, setPrivateKeyValidation] =
    useState<PrivateKeyValidation | null>(null);
  const [publicKeyValidation, setPublicKeyValidation] =
    useState<PublicKeyValidation | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  /** Keep drawer scroll put across verify re-renders (badge / results). */
  const pinnedScrollTop = useRef<number | null>(null);

  useLayoutEffect(() => {
    if (pinnedScrollTop.current == null || !scrollRef.current) return;
    scrollRef.current.scrollTop = pinnedScrollTop.current;
    if (!verifying) pinnedScrollTop.current = null;
  }, [verifying, verify, privateKeyValidation, publicKeyValidation, error]);

  const sshMode = form.authMode !== "password";

  const set = (patch: Partial<HostRecord>) => {
    setForm((f) => ({ ...f, ...patch }));
    setVerify(null);
  };

  const authFields = authDraftToRecord(
    form.authMode,
    privateKeyDraft,
    publicKeyDraft,
    firstTimeDeploy,
  );
  const hasPrivateKey = (authFields.sshPrivateKeyPath?.trim()?.length ?? 0) > 0;
  const hasPassword = (form.password?.trim()?.length ?? 0) > 0;
  const hasPublicKey = (authFields.sshPublicKey?.trim()?.length ?? 0) > 0;

  const canSubmit =
    form.alias.trim() !== "" && form.username.trim() !== "" && form.ip.trim() !== "";

  const parsePort = (): number | null => {
    const t = portText.trim();
    if (!t) return null;
    const n = Number(t);
    if (!Number.isInteger(n) || n < 1 || n > 65535) return null;
    return n;
  };

  const buildRecord = (): HostRecord => {
    const auth = authDraftToRecord(
      form.authMode,
      privateKeyDraft,
      publicKeyDraft,
      firstTimeDeploy,
    );
    return {
      ...form,
      alias: form.alias.trim(),
      hostname: null,
      username: form.username.trim(),
      ip: form.ip.trim(),
      port: parsePort(),
      authMode: auth.authMode,
      sshPrivateKeyPath: auth.sshPrivateKeyPath,
      sshPublicKey: auth.sshPublicKey,
      password: firstTimeDeploy || !sshMode ? form.password : null,
    };
  };

  const openKeyPanel = (kind: SshKeyPanelKind) => {
    if (kind === "public" && !firstTimeDeploy) return;
    onKeyPanelChange(keyPanel === kind ? null : kind);
  };

  const handleValidatePrivateKey = async () => {
    if (!authFields.sshPrivateKeyPath) {
      setPrivateKeyValidation(null);
      return;
    }
    try {
      const r = await validateSshPrivateKey(authFields.sshPrivateKeyPath);
      setPrivateKeyValidation(r);
    } catch (err) {
      setPrivateKeyValidation({
        valid: false,
        fingerprint: null,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const handleValidatePublicKey = async () => {
    if (!authFields.sshPublicKey) {
      setPublicKeyValidation(null);
      return;
    }
    try {
      const r = await validateSshPublicKey({ sshPublicKey: authFields.sshPublicKey });
      setPublicKeyValidation(r);
    } catch (err) {
      setPublicKeyValidation({
        valid: false,
        fingerprint: null,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const handleVerify = async () => {
    pinnedScrollTop.current = scrollRef.current?.scrollTop ?? 0;
    setVerifying(true);
    setVerify(null);
    setError(null);

    if (sshMode && !hasPrivateKey) {
      setError(t("hosts.editor.error.privateKeyRequired"));
      setVerifying(false);
      return;
    }
    if (!sshMode && !hasPassword) {
      setError(t("hosts.editor.error.passwordRequired"));
      setVerifying(false);
      return;
    }
    if (sshMode && firstTimeDeploy && !hasPassword) {
      setError(t("hosts.editor.error.passwordRequiredDeploy"));
      setVerifying(false);
      return;
    }
    if (sshMode && firstTimeDeploy && !hasPublicKey) {
      setError(t("hosts.editor.error.publicKeyRequiredDeploy"));
      setVerifying(false);
      return;
    }

    try {
      if (sshMode) await handleValidatePrivateKey();
      if (sshMode && firstTimeDeploy && authFields.sshPublicKey) {
        await handleValidatePublicKey();
      }

      const r = await verifyHost({
        authMode: form.authMode,
        ip: form.ip.trim(),
        port: parsePort(),
        username: form.username.trim(),
        password: firstTimeDeploy || !sshMode ? form.password : null,
        sshPrivateKeyPath: authFields.sshPrivateKeyPath,
        sshPublicKey: firstTimeDeploy ? authFields.sshPublicKey : null,
      });
      setVerify(r);

      if (r.publicKeyFingerprint && sshMode) {
        setPrivateKeyValidation((prev) => ({
          valid: prev?.valid ?? r.authenticated,
          fingerprint: r.publicKeyFingerprint,
          message: prev?.message ?? null,
        }));
      }
      if (r.publicKeyValid != null) {
        setPublicKeyValidation({
          valid: r.publicKeyValid,
          fingerprint: r.publicKeyFingerprint,
          message: r.publicKeyValid ? null : r.message,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setVerifying(false);
    }
  };

  const handleSave = async () => {
    if (sshMode && !hasPrivateKey) {
      setError(t("hosts.editor.error.privateKeyRequired"));
      return;
    }
    if (sshMode && firstTimeDeploy && !hasPassword) {
      setError(t("hosts.editor.error.passwordRequiredDeploy"));
      return;
    }
    if (sshMode && firstTimeDeploy && !hasPublicKey) {
      setError(t("hosts.editor.error.publicKeyRequiredDeploy"));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(buildRecord());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  };

  const privateLabel = keySummary(privateKeyDraft);
  const publicLabel = keySummary(publicKeyDraft);

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-base font-semibold">
          {form.id ? t("hosts.editor.editTitle") : t("hosts.editor.newTitle")}
        </h2>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label={t("common.close")}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 space-y-3 overflow-y-auto px-4 py-3"
        onScroll={() => {
          if (pinnedScrollTop.current != null && scrollRef.current) {
            pinnedScrollTop.current = scrollRef.current.scrollTop;
          }
        }}
      >
        {/* Login mode as top tabs */}
        <div
          role="tablist"
          aria-label={t("hosts.editor.loginMode")}
          className="flex gap-1 border-b border-border"
        >
          {(["ssh", "password"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              role="tab"
              aria-selected={form.authMode === mode}
              onClick={() => {
                set({ authMode: mode });
                onKeyPanelChange(null);
                if (mode === "password") onFirstTimeDeployChange(false);
              }}
              className={cn(
                "-mb-px rounded-t-md border border-b-0 px-4 py-2 text-sm font-medium transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                form.authMode === mode
                  ? "border-border bg-card text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {mode === "ssh" ? t("hosts.editor.auth.ssh") : t("hosts.editor.auth.password")}
            </button>
          ))}
        </div>

        <Field label={t("hosts.editor.alias")}>
          <Input
            value={form.alias}
            onChange={(e) => set({ alias: e.target.value })}
            placeholder={t("hosts.editor.aliasPlaceholder")}
            autoComplete="off"
          />
        </Field>
        <Field label={t("hosts.editor.username")}>
          <Input
            value={form.username}
            onChange={(e) => set({ username: e.target.value })}
            placeholder={t("hosts.editor.usernamePlaceholder")}
            autoComplete="off"
            spellCheck={false}
          />
        </Field>
        <Field label={t("hosts.editor.ip")}>
          <Input
            value={form.ip}
            onChange={(e) => set({ ip: e.target.value })}
            placeholder={t("hosts.editor.ipPlaceholder")}
            autoComplete="off"
            spellCheck={false}
          />
        </Field>
        <Field label={t("hosts.editor.port")}>
          <Input
            type="text"
            inputMode="numeric"
            value={portText}
            onChange={(e) => {
              setPortText(e.target.value.replace(/[^\d]/g, ""));
              setVerify(null);
            }}
            placeholder={t("hosts.editor.portPlaceholder")}
            autoComplete="off"
            spellCheck={false}
            className="[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
        </Field>

        <div className="border-t border-border/50" role="separator" />

        {sshMode ? (
          <>
            <Field
              label={t("hosts.editor.privateKey")}
              trailing={
                privateKeyValidation ? (
                  <Badge
                    variant={privateKeyValidation.valid ? "success" : "destructive"}
                    title={
                      privateKeyValidation.fingerprint ??
                      privateKeyValidation.message ??
                      undefined
                    }
                  >
                    {privateKeyValidation.valid
                      ? t("common.valid")
                      : t("common.invalid")}
                  </Badge>
                ) : null
              }
            >
              <FieldTrigger
                icon={<KeyRound className="h-4 w-4" />}
                label={privateLabel || t("hosts.sshKey.private.prompt")}
                active={keyPanel === "private"}
                onClick={() => openKeyPanel("private")}
              />
            </Field>

            <div
              className={cn(
                "space-y-3 rounded-lg border p-3",
                firstTimeDeploy
                  ? "border-primary/40 bg-primary/5"
                  : "border-border/60 bg-muted/10",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-muted-foreground">
                  {t("hosts.editor.firstTime.title")}
                </span>
                <div className="flex items-center gap-1">
                  <InfoHint
                    align="end"
                    ariaLabel={t("hosts.editor.firstTime.helpAria")}
                    title={t("hosts.editor.firstTime.dialogTitle")}
                    body={t("hosts.editor.firstTime.helpBody")}
                  />
                  <button
                    type="button"
                    role="switch"
                    aria-checked={firstTimeDeploy}
                    aria-label={t("hosts.editor.firstTime.toggleAria")}
                    onClick={() => {
                      const next = !firstTimeDeploy;
                      onFirstTimeDeployChange(next);
                      if (!next && keyPanel === "public") onKeyPanelChange(null);
                      setVerify(null);
                    }}
                    className={cn(
                      "relative h-5 w-9 shrink-0 rounded-full border",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      firstTimeDeploy
                        ? "border-primary bg-primary"
                        : "border-input bg-muted",
                    )}
                  >
                    <span
                      className={cn(
                        "absolute top-0.5 block h-3.5 w-3.5 rounded-full bg-background shadow-sm",
                        firstTimeDeploy ? "translate-x-[18px]" : "translate-x-0.5",
                      )}
                      style={{ transition: "transform 0.15s ease-out" }}
                    />
                  </button>
                </div>
              </div>

              {firstTimeDeploy && (
                <>
                  <Field label={t("hosts.editor.password")}>
                    <Input
                      type="password"
                      value={form.password ?? ""}
                      onChange={(e) => set({ password: e.target.value })}
                      placeholder={t("hosts.editor.passwordPlaceholder")}
                      autoComplete="new-password"
                    />
                  </Field>
                  <Field
                    label={t("hosts.editor.publicKey")}
                    trailing={
                      publicKeyValidation && authFields.sshPublicKey ? (
                        <Badge
                          variant={publicKeyValidation.valid ? "success" : "destructive"}
                          title={
                            publicKeyValidation.fingerprint ??
                            publicKeyValidation.message ??
                            undefined
                          }
                        >
                          {publicKeyValidation.valid
                            ? t("common.valid")
                            : t("common.invalid")}
                        </Badge>
                      ) : null
                    }
                  >
                    <FieldTrigger
                      icon={<FileKey className="h-4 w-4" />}
                      label={publicLabel || t("hosts.sshKey.public.prompt")}
                      active={keyPanel === "public"}
                      onClick={() => openKeyPanel("public")}
                    />
                  </Field>
                </>
              )}
            </div>
          </>
        ) : (
          <Field label={t("hosts.editor.password")}>
            <Input
              type="password"
              value={form.password ?? ""}
              onChange={(e) => set({ password: e.target.value })}
              placeholder={t("hosts.editor.passwordPlaceholder")}
              autoComplete="new-password"
            />
          </Field>
        )}

        <Button
          variant="secondary"
          className="w-full"
          disabled={verifying || !form.ip.trim() || !form.username.trim()}
          onClick={handleVerify}
        >
          {verifying ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ShieldCheck className="h-4 w-4" />
          )}
          {verifying ? t("hosts.editor.verifying") : t("hosts.editor.verifyConnection")}
        </Button>

        {error && <p className="text-xs text-destructive">{error}</p>}

        <Button className="w-full" disabled={!canSubmit || saving} onClick={handleSave}>
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {saving ? t("common.saving") : t("hosts.editor.saveHost")}
        </Button>

        {verify && (
          <div className="space-y-1.5 rounded-lg border border-border/60 p-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t("hosts.editor.verify.tcpReachable")}</span>
              <Badge variant={verify.reachable ? "success" : "destructive"}>
                {verify.reachable ? t("common.ok") : t("common.failed")}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t("hosts.editor.verify.sshAuth")}</span>
              <Badge variant={verify.authenticated ? "success" : "destructive"}>
                {verify.authenticated ? t("common.ok") : t("common.failed")}
              </Badge>
            </div>
            {verify.authMethod && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{t("hosts.editor.verify.authMethod")}</span>
                <span className="font-medium">{verify.authMethod}</span>
              </div>
            )}
            {verify.keyDeployed && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{t("hosts.editor.verify.keyDeployed")}</span>
                <Badge variant="success">{t("hosts.editor.verify.sshCopyId")}</Badge>
              </div>
            )}
            {verify.latencyMs != null && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{t("hosts.editor.verify.connectTime")}</span>
                <span className="tabular-nums">{formatMs(verify.latencyMs)}</span>
              </div>
            )}
            {verify.message && (
              <p className="pt-1 text-destructive">{verify.message}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  trailing,
  children,
}: {
  label: string;
  trailing?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex min-h-5 items-center justify-between gap-2">
        <label className="text-xs font-medium text-muted-foreground">{label}</label>
        {trailing}
      </div>
      {children}
    </div>
  );
}
