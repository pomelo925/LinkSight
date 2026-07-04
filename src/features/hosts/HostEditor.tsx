import { useState } from "react";
import { ShieldCheck, Loader2, X, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { verifyHost } from "@/lib/api";
import { formatMs } from "@/lib/utils";
import type { HostRecord, VerifyResult } from "@/lib/types";

interface Props {
  /** Record being edited; `id === ""` means creating a new host. */
  host: HostRecord;
  onSave: (host: HostRecord) => Promise<void>;
  onClose: () => void;
}

/** Termius-style side panel for creating / editing a saved host. */
export function HostEditor({ host, onSave, onClose }: Props) {
  const [form, setForm] = useState<HostRecord>({ ...host });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [verifying, setVerifying] = useState(false);
  const [verify, setVerify] = useState<VerifyResult | null>(null);

  const set = (patch: Partial<HostRecord>) => {
    setForm((f) => ({ ...f, ...patch }));
    setVerify(null);
  };

  const canSubmit =
    form.alias.trim() !== "" && form.username.trim() !== "" && form.ip.trim() !== "";

  const handleVerify = async () => {
    setVerifying(true);
    setVerify(null);
    setError(null);
    try {
      const r = await verifyHost(
        form.ip.trim(),
        form.port || 22,
        form.username.trim(),
        form.password ?? "",
      );
      setVerify(r);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setVerifying(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSave({
        ...form,
        alias: form.alias.trim(),
        hostname: form.hostname?.trim() || null,
        username: form.username.trim(),
        ip: form.ip.trim(),
        port: form.port || 22,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  };

  return (
    <Card className="w-80 shrink-0 self-start">
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">
          {form.id ? "Edit Host" : "New Host"}
        </CardTitle>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <Field label="Alias *">
          <Input
            value={form.alias}
            onChange={(e) => set({ alias: e.target.value })}
            placeholder="e.g. Lab Server"
            autoComplete="off"
          />
        </Field>
        <Field label="Hostname">
          <Input
            value={form.hostname ?? ""}
            onChange={(e) => set({ hostname: e.target.value })}
            placeholder="e.g. lab-server.local"
            autoComplete="off"
          />
        </Field>
        <Field label="Username *">
          <Input
            value={form.username}
            onChange={(e) => set({ username: e.target.value })}
            placeholder="e.g. ubuntu"
            autoComplete="off"
            spellCheck={false}
          />
        </Field>
        <Field label="IP *">
          <Input
            value={form.ip}
            onChange={(e) => set({ ip: e.target.value })}
            placeholder="e.g. 192.168.1.50"
            autoComplete="off"
            spellCheck={false}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Password">
            <Input
              type="password"
              value={form.password ?? ""}
              onChange={(e) => set({ password: e.target.value })}
              placeholder="••••••••"
              autoComplete="new-password"
            />
          </Field>
          <Field label="Port">
            <Input
              type="number"
              min={1}
              max={65535}
              value={form.port}
              onChange={(e) => set({ port: Number(e.target.value) || 0 })}
              placeholder="22"
            />
          </Field>
        </div>

        {/* ---- Verification ---- */}
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
          {verifying ? "Verifying…" : "Verify Connection"}
        </Button>

        {verify && (
          <div className="space-y-1.5 rounded-lg border border-border/60 p-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">TCP reachable</span>
              <Badge variant={verify.reachable ? "success" : "destructive"}>
                {verify.reachable ? "OK" : "Failed"}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">SSH authentication</span>
              <Badge variant={verify.authenticated ? "success" : "destructive"}>
                {verify.authenticated ? "OK" : "Failed"}
              </Badge>
            </div>
            {verify.latencyMs != null && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Connect time</span>
                <span className="tabular-nums">{formatMs(verify.latencyMs)}</span>
              </div>
            )}
            {verify.message && (
              <p className="pt-1 text-destructive">{verify.message}</p>
            )}
          </div>
        )}

        {error && <p className="text-xs text-destructive">{error}</p>}

        <Button className="w-full" disabled={!canSubmit || saving} onClick={handleSave}>
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {saving ? "Saving…" : "Save Host"}
        </Button>
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}
