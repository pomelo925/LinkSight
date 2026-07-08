import { useCallback, useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/hooks/useI18n";
import { cn } from "@/lib/utils";
import type { SettingsSaveActions } from "@/features/settings/SettingsPanel";
import {
  DEFAULT_TRACE_HOST,
  DEFAULT_TRACE_MAX_HOPS,
  GATEWAY_TRACE_MAX_HOPS,
  isValidTraceHost,
  TRACE_HOST_PRESETS,
  useTracerouteSettingsStore,
} from "@/store/useTracerouteSettingsStore";

function parseInRange(s: string, min: number, max: number): number | null {
  const t = s.trim();
  if (!/^\d+$/.test(t)) return null;
  const n = parseInt(t, 10);
  return n >= min && n <= max ? n : null;
}

/** Internet-test traceroute target and hop limit. */
export function TracerouteSettingsForm({
  variant = "page",
  resetToken,
  onSaveActionsChange,
}: {
  variant?: "page" | "dialog";
  resetToken?: number;
  onSaveActionsChange?: (actions: SettingsSaveActions | null) => void;
}) {
  const { t } = useI18n();
  const traceHost = useTracerouteSettingsStore((s) => s.traceHost);
  const traceMaxHops = useTracerouteSettingsStore((s) => s.traceMaxHops);
  const setTraceHost = useTracerouteSettingsStore((s) => s.setTraceHost);
  const setTraceMaxHops = useTracerouteSettingsStore((s) => s.setTraceMaxHops);
  const [draftHost, setDraftHost] = useState(traceHost);
  const [draftHops, setDraftHops] = useState(String(traceMaxHops));

  useEffect(() => {
    setDraftHost(traceHost);
    setDraftHops(String(traceMaxHops));
  }, [traceHost, traceMaxHops, resetToken]);

  const hostValid = isValidTraceHost(draftHost);
  const hopsParsed = parseInRange(draftHops, 1, 64);
  const hopsInvalid = draftHops.trim() !== "" && hopsParsed == null;
  const canSave = hostValid && hopsParsed != null;

  const applyHost = () => {
    if (!hostValid) return;
    setTraceHost(draftHost);
  };

  const applyHops = () => {
    if (hopsParsed == null) return;
    setTraceMaxHops(hopsParsed);
  };

  const handleSave = useCallback(() => {
    if (!canSave || hopsParsed == null) return;
    setTraceHost(draftHost);
    setTraceMaxHops(hopsParsed);
  }, [canSave, hopsParsed, draftHost, setTraceHost, setTraceMaxHops]);

  useEffect(() => {
    if (variant !== "dialog" || !onSaveActionsChange) return;
    onSaveActionsChange({ canSave, onSave: handleSave });
    return () => onSaveActionsChange(null);
  }, [variant, canSave, handleSave, onSaveActionsChange]);

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">
          {t("settings.traceroute.hostLabel")}
        </label>
        <Input
          value={draftHost}
          onChange={(e) => setDraftHost(e.target.value)}
          onBlur={variant === "page" ? applyHost : undefined}
          onKeyDown={(e) => {
            if (e.key === "Enter" && variant === "page") applyHost();
          }}
          placeholder={DEFAULT_TRACE_HOST}
          spellCheck={false}
          autoComplete="off"
          className={cn(!hostValid && draftHost.length > 0 && "border-destructive")}
        />
        <p className="text-xs text-muted-foreground">{t("settings.traceroute.hostHint")}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {TRACE_HOST_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => {
              if (preset.id === "gateway") {
                const hops = GATEWAY_TRACE_MAX_HOPS;
                setDraftHops(String(hops));
                if (variant === "page") setTraceMaxHops(hops);
                return;
              }
              setDraftHost(preset.host);
              setDraftHops(String(DEFAULT_TRACE_MAX_HOPS));
              if (variant === "page") {
                setTraceHost(preset.host);
                setTraceMaxHops(DEFAULT_TRACE_MAX_HOPS);
              }
            }}
            className={cn(
              "rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              preset.id !== "gateway" && traceHost === preset.host
                ? "border-primary bg-primary/10 text-primary"
                : preset.id === "gateway" && traceMaxHops === GATEWAY_TRACE_MAX_HOPS
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-input text-muted-foreground hover:border-primary/50 hover:text-foreground",
            )}
          >
            {t(`settings.traceroute.preset.${preset.id}`)}
          </button>
        ))}
      </div>

      <div className="space-y-1.5">
        <div className="max-w-[8rem] space-y-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <label className="text-xs font-medium text-muted-foreground">
              {t("settings.traceroute.maxHopsLabel")}
            </label>
            <span
              className={cn(
                "text-[11px] tabular-nums",
                hopsInvalid ? "text-destructive" : "text-muted-foreground/60",
              )}
            >
              {t("settings.traceroute.range.hops")}
            </span>
          </div>
          <Input
            type="text"
            inputMode="numeric"
            value={draftHops}
            onChange={(e) => setDraftHops(e.target.value)}
            onBlur={variant === "page" ? applyHops : undefined}
            onKeyDown={(e) => {
              if (e.key === "Enter" && variant === "page") applyHops();
            }}
            aria-invalid={hopsInvalid}
            className={cn(
              hopsInvalid &&
                "border-destructive focus-visible:border-destructive focus-visible:ring-destructive/40",
            )}
          />
        </div>
        <p className="text-[11px] text-muted-foreground/70">
          {t("settings.traceroute.maxHopsHint")}
        </p>
      </div>
    </div>
  );
}
