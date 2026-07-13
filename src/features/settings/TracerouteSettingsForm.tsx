import { useCallback, useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { ThemedSelect } from "@/components/ui/themed-select";
import { useI18n } from "@/hooks/useI18n";
import { cn } from "@/lib/utils";
import type { SettingsSaveActions } from "@/features/settings/SettingsPanel";
import {
  DEFAULT_TRACE_HOST,
  DEFAULT_TRACE_MAX_HOPS,
  isValidTraceHost,
  matchTraceHostPreset,
  normalizeTraceHost,
  TRACE_HOST_PRESETS,
  type TraceHostPresetId,
  useTracerouteSettingsStore,
} from "@/store/useTracerouteSettingsStore";

function parseInRange(s: string, min: number, max: number): number | null {
  const t = s.trim();
  if (!/^\d+$/.test(t)) return null;
  const n = parseInt(t, 10);
  return n >= min && n <= max ? n : null;
}

function numberValidationError(
  value: string,
  min: number,
  max: number,
  t: (key: string) => string,
): string | null {
  const s = value.trim();
  if (s === "") return t("settings.validation.required");
  if (!/^\d+$/.test(s)) return t("settings.validation.invalidNumber");
  const n = parseInt(s, 10);
  if (n < min || n > max) return t("settings.validation.invalidNumberRange");
  return null;
}

function hostValidationError(
  host: string,
  t: (key: string) => string,
): string | null {
  if (!host.trim()) return t("settings.validation.hostRequired");
  if (!isValidTraceHost(host)) return t("settings.validation.invalidHost");
  return null;
}

/** Internet-test traceroute target and hop limit. */
export function TracerouteSettingsForm({
  resetToken,
  onSaveActionsChange,
}: {
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

  const hostError = hostValidationError(draftHost, t);
  const hopsError = numberValidationError(draftHops, 1, 64, t);
  const hostValid = hostError == null;
  const hopsParsed = parseInRange(draftHops, 1, 64);
  const dirty =
    normalizeTraceHost(draftHost) !== normalizeTraceHost(traceHost) ||
    (hopsParsed != null
      ? hopsParsed !== traceMaxHops
      : draftHops.trim() !== String(traceMaxHops));
  const canSave = hostValid && hopsParsed != null && dirty;
  const selectedPreset = matchTraceHostPreset(draftHost);

  const presetOptions = useMemo(
    () => [
      ...TRACE_HOST_PRESETS.map((preset) => ({
        value: preset.id,
        label: t(`settings.traceroute.preset.${preset.id}`),
      })),
      { value: "custom", label: t("settings.traceroute.preset.custom") },
    ],
    [t],
  );

  const applyPreset = (id: TraceHostPresetId) => {
    const preset = TRACE_HOST_PRESETS.find((p) => p.id === id);
    if (!preset) return;
    setDraftHost(preset.host);
    setDraftHops(String(DEFAULT_TRACE_MAX_HOPS));
  };

  const handleSave = useCallback(() => {
    if (!canSave || hopsParsed == null) return;
    setTraceHost(draftHost);
    setTraceMaxHops(hopsParsed);
  }, [canSave, hopsParsed, draftHost, setTraceHost, setTraceMaxHops]);

  useEffect(() => {
    if (!onSaveActionsChange) return;
    onSaveActionsChange({ canSave, onSave: handleSave });
    return () => onSaveActionsChange(null);
  }, [canSave, handleSave, onSaveActionsChange]);

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <div className="flex items-baseline gap-2">
          <label className="shrink-0 text-xs font-medium text-muted-foreground">
            {t("settings.traceroute.hostLabel")}
          </label>
          {hostError && (
            <p
              className="min-w-0 flex-1 truncate text-left text-[11px] font-medium text-destructive"
              role="alert"
              title={hostError}
            >
              {hostError}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Input
            value={draftHost}
            onChange={(e) => setDraftHost(e.target.value)}
            placeholder={DEFAULT_TRACE_HOST}
            spellCheck={false}
            autoComplete="off"
            aria-invalid={Boolean(hostError)}
            className={cn(
              "min-w-0 flex-1",
              hostError &&
                "border-destructive focus-visible:border-destructive focus-visible:ring-destructive/40",
            )}
          />
          <ThemedSelect
            aria-label={t("settings.traceroute.hostLabel")}
            value={selectedPreset}
            options={presetOptions}
            onChange={(id) => {
              if (id === "custom") return;
              applyPreset(id as TraceHostPresetId);
            }}
            className="min-w-[9.5rem] shrink-0"
          />
        </div>
        <p className="text-xs text-muted-foreground">{t("settings.traceroute.hostHint")}</p>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-baseline gap-2">
          <label className="shrink-0 text-xs font-medium text-muted-foreground">
            {t("settings.traceroute.maxHopsLabel")}
          </label>
          {hopsError && (
            <p
              className="min-w-0 flex-1 truncate text-left text-[11px] font-medium text-destructive"
              role="alert"
              title={hopsError}
            >
              {hopsError}
            </p>
          )}
          <span
            className={cn(
              "ml-auto shrink-0 text-[11px] tabular-nums",
              hopsError ? "text-destructive/70" : "text-muted-foreground/60",
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
          aria-invalid={Boolean(hopsError)}
          className={cn(
            "max-w-[8rem]",
            hopsError &&
              "border-destructive focus-visible:border-destructive focus-visible:ring-destructive/40",
          )}
        />
        <p className="text-[11px] text-muted-foreground/70">
          {t("settings.traceroute.maxHopsHint")}
        </p>
      </div>
    </div>
  );
}
