import { useCallback, useEffect, useState } from "react";
import { Save, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/hooks/useI18n";
import { cn } from "@/lib/utils";
import type { SettingsSaveActions } from "@/features/settings/SettingsPanel";
import {
  useConnectivitySettingsStore,
  DEFAULT_CONNECTIVITY_SETTINGS,
  currentConnectivitySettings,
} from "@/store/useConnectivitySettingsStore";
import type {
  ConnectivityDirection,
  ConnectivityProtocol,
} from "@/lib/types";

function parseInRange(s: string, min: number, max: number): number | null {
  const t = s.trim();
  if (!/^\d+$/.test(t)) return null;
  const n = parseInt(t, 10);
  return n >= min && n <= max ? n : null;
}

function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  disabled,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  const cols =
    options.length === 2
      ? "grid-cols-2"
      : options.length === 3
        ? "grid-cols-3"
        : "grid-cols-1";
  return (
    <div className={cn("grid gap-2", cols)}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          disabled={disabled}
          onClick={() => onChange(opt.value)}
          className={cn(
            "whitespace-nowrap rounded-md border px-2 py-2 text-xs font-medium",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            "disabled:cursor-not-allowed disabled:opacity-50",
            value === opt.value
              ? "border-primary bg-primary/10 text-primary"
              : "border-input text-muted-foreground hover:border-primary/50",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function NumberField({
  label,
  range,
  value,
  onChange,
  disabled,
  invalid,
  hint,
}: {
  label: string;
  range: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <label className="text-xs font-medium text-muted-foreground">{label}</label>
        <span
          className={cn(
            "text-[11px] tabular-nums",
            invalid ? "text-destructive" : "text-muted-foreground/60",
          )}
        >
          {range}
        </span>
      </div>
      <Input
        type="text"
        inputMode="numeric"
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={invalid}
        className={cn(
          invalid && "border-destructive focus-visible:border-destructive focus-visible:ring-destructive/40",
        )}
      />
      {hint && <p className="text-[11px] text-muted-foreground/70">{hint}</p>}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

function StageSwitch({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-border px-2.5 py-2">
      <span className="min-w-0 text-xs font-medium leading-tight">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors duration-150",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
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
    </div>
  );
}

/** P2P connectivity test parameters — inline (Settings) or inside a dialog. */
export function ConnectivitySettingsForm({
  variant = "inline",
  onClose,
  resetToken,
  onSaveActionsChange,
}: {
  variant?: "inline" | "dialog";
  onClose?: () => void;
  resetToken?: number;
  onSaveActionsChange?: (actions: SettingsSaveActions | null) => void;
}) {
  const { t } = useI18n();
  const commit = useConnectivitySettingsStore((s) => s.set);
  const init = currentConnectivitySettings();

  const [pingCount, setPingCount] = useState(String(init.pingCount));
  const [hops, setHops] = useState(String(init.tracerouteMaxHops));
  const [streams, setStreams] = useState(String(init.iperfStreams));
  const [direction, setDirection] = useState<ConnectivityDirection>(init.direction);
  const [protocol, setProtocol] = useState<ConnectivityProtocol>(init.protocol);
  const [enableHandshake, setEnableHandshake] = useState(init.enableHandshake);
  const [enablePing, setEnablePing] = useState(init.enablePing);
  const [enableMtu, setEnableMtu] = useState(init.enableMtu);
  const [enableTraceroute, setEnableTraceroute] = useState(init.enableTraceroute);
  const [enableThroughput, setEnableThroughput] = useState(init.enableThroughput);

  useEffect(() => {
    const d = currentConnectivitySettings();
    setPingCount(String(d.pingCount));
    setHops(String(d.tracerouteMaxHops));
    setStreams(String(d.iperfStreams));
    setDirection(d.direction);
    setProtocol(d.protocol);
    setEnableHandshake(d.enableHandshake);
    setEnablePing(d.enablePing);
    setEnableMtu(d.enableMtu);
    setEnableTraceroute(d.enableTraceroute);
    setEnableThroughput(d.enableThroughput);
  }, [resetToken]);

  const pingParsed = parseInRange(pingCount, 1, 50);
  const hopsParsed = parseInRange(hops, 1, 64);
  const streamsParsed = parseInRange(streams, 1, 128);

  const pingInvalid = enablePing && pingParsed == null;
  const hopsInvalid = enableTraceroute && hopsParsed == null;
  const streamsInvalid = enableThroughput && streamsParsed == null;
  const canSave = !pingInvalid && !hopsInvalid && !streamsInvalid;
  const throughputOff = !enableThroughput;

  const handleReset = () => {
    const d = DEFAULT_CONNECTIVITY_SETTINGS;
    setPingCount(String(d.pingCount));
    setHops(String(d.tracerouteMaxHops));
    setStreams(String(d.iperfStreams));
    setDirection(d.direction);
    setProtocol(d.protocol);
    setEnableHandshake(d.enableHandshake);
    setEnablePing(d.enablePing);
    setEnableMtu(d.enableMtu);
    setEnableTraceroute(d.enableTraceroute);
    setEnableThroughput(d.enableThroughput);
  };

  const handleSave = useCallback(() => {
    if (!canSave) return;
    commit("pingCount", pingParsed ?? init.pingCount);
    commit("tracerouteMaxHops", hopsParsed ?? init.tracerouteMaxHops);
    commit("iperfStreams", streamsParsed ?? init.iperfStreams);
    commit("direction", direction);
    commit("protocol", protocol);
    commit("enableHandshake", enableHandshake);
    commit("enablePing", enablePing);
    commit("enableMtu", enableMtu);
    commit("enableTraceroute", enableTraceroute);
    commit("enableThroughput", enableThroughput);
    onClose?.();
  }, [
    canSave,
    commit,
    pingParsed,
    hopsParsed,
    streamsParsed,
    init,
    direction,
    protocol,
    enableHandshake,
    enablePing,
    enableMtu,
    enableTraceroute,
    enableThroughput,
    onClose,
  ]);

  useEffect(() => {
    if (variant !== "dialog" || !onSaveActionsChange) return;
    onSaveActionsChange({ canSave, onSave: handleSave });
    return () => onSaveActionsChange(null);
  }, [variant, canSave, handleSave, onSaveActionsChange]);

  const showInlineFooter = variant === "inline";
  const showStandaloneDialogFooter = variant === "dialog" && !!onClose;

  return (
    <div className="space-y-5">
      <Field label={t("connectivity.settings.stages")}>
        <div className="grid grid-cols-2 gap-2">
          <StageSwitch label={t("connectivity.settings.stage.handshake")} checked={enableHandshake} onChange={setEnableHandshake} />
          <StageSwitch label={t("connectivity.settings.stage.ping")} checked={enablePing} onChange={setEnablePing} />
          <StageSwitch label={t("connectivity.settings.stage.mtu")} checked={enableMtu} onChange={setEnableMtu} />
          <StageSwitch label={t("connectivity.settings.stage.traceroute")} checked={enableTraceroute} onChange={setEnableTraceroute} />
          <StageSwitch label={t("connectivity.settings.stage.throughput")} checked={enableThroughput} onChange={setEnableThroughput} />
        </div>
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <NumberField
          label={t("connectivity.settings.pingPackets")}
          range={t("connectivity.settings.range.ping")}
          value={pingCount}
          disabled={!enablePing}
          invalid={pingInvalid}
          onChange={setPingCount}
          hint={t("connectivity.settings.hint.pingPackets")}
        />
        <NumberField
          label={t("connectivity.settings.tracerouteHops")}
          range={t("connectivity.settings.range.hops")}
          value={hops}
          disabled={!enableTraceroute}
          invalid={hopsInvalid}
          onChange={setHops}
        />
        <NumberField
          label={t("connectivity.settings.streams")}
          range={t("connectivity.settings.range.streams")}
          value={streams}
          disabled={throughputOff}
          invalid={streamsInvalid}
          onChange={setStreams}
          hint={t("connectivity.settings.hint.streams")}
        />
        <Field label={t("connectivity.settings.direction")}>
          <SegmentedControl<ConnectivityDirection>
            value={direction}
            disabled={throughputOff}
            options={[
              { value: "up", label: t("connectivity.metrics.uplink") },
              { value: "down", label: t("connectivity.metrics.downlink") },
              { value: "both", label: t("connectivity.settings.direction.both") },
            ]}
            onChange={setDirection}
          />
        </Field>
        <Field label={t("connectivity.settings.protocol")}>
          <SegmentedControl<ConnectivityProtocol>
            value={protocol}
            disabled={throughputOff}
            options={[
              { value: "tcp", label: t("connectivity.settings.protocol.tcp") },
              { value: "udp", label: t("connectivity.settings.protocol.udp") },
            ]}
            onChange={setProtocol}
          />
        </Field>
      </div>

      {(showInlineFooter || showStandaloneDialogFooter) && (
        <div
          className={cn(
            "flex items-center justify-between",
            (showInlineFooter || showStandaloneDialogFooter) && "border-t border-border pt-4",
          )}
        >
          {showInlineFooter ? (
            <Button variant="ghost" size="sm" onClick={handleReset}>
              <RotateCcw className="h-4 w-4" />
              {t("connectivity.settings.resetDefaults")}
            </Button>
          ) : (
            <div />
          )}
          <div className="flex items-center gap-2">
            {showStandaloneDialogFooter && onClose && (
              <Button variant="secondary" size="sm" onClick={onClose}>
                {t("common.cancel")}
              </Button>
            )}
            <Button size="sm" disabled={!canSave} onClick={handleSave}>
              <Save className="h-4 w-4" />
              {t("settings.save")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
