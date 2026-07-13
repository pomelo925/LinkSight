import { memo, useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Download, Upload, Timer, Waves, Gauge, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useSpeedtest } from "@/hooks/useSpeedtest";
import { useTraceroute } from "@/hooks/useTraceroute";
import { useTracerouteStore } from "@/store/useTracerouteStore";
import { useTracerouteSettingsStore } from "@/store/useTracerouteSettingsStore";
import { useI18n } from "@/hooks/useI18n";
import { formatMs, cn } from "@/lib/utils";
import type {
  SpeedtestPhase,
  SpeedtestProgress,
  SpeedtestResult,
} from "@/lib/types";
import { StatusIndicator } from "./StatusIndicator";
import { TracerouteResults } from "./TracerouteResults";
import { SettingsDialog } from "@/features/settings/SettingsDialogs";

type SpeedtestLocationState = {
  autoRun?: boolean;
  /** Optional page-enter fade duration (ms), set by Home Internet Test transition. */
  enterFadeMs?: number;
};

function formatMbps(value: number | null | undefined, emptyValue: string): string {
  if (value == null) return emptyValue;
  return value.toFixed(1);
}

interface DirectionalSubMetric {
  download: number | null;
  upload: number | null;
}

export interface SpeedMetricValues {
  downloadMbps: number | null;
  uploadMbps: number | null;
  latencyMs: number | null;
  jitterMs: number | null;
  latency: DirectionalSubMetric;
  jitter: DirectionalSubMetric;
}

interface MetricProps {
  icon: typeof Download;
  label: string;
  value: string;
  unit: string;
  accent: string;
  active?: boolean;
  phaseProgress?: number;
  subMetrics?: {
    download: string;
    upload: string;
    downloadAccent: string;
    uploadAccent: string;
  };
}

const Metric = memo(function Metric({
  icon: Icon,
  label,
  value,
  unit,
  accent,
  active,
  phaseProgress,
  subMetrics,
}: MetricProps) {
  return (
    <Card className={cn(active && "border-primary/60")}>
      <CardContent className="relative flex flex-col items-center gap-1 overflow-hidden px-3 py-4 text-center">
        <div
          className={cn(
            "flex items-center gap-1.5 text-sm font-medium uppercase tracking-wide",
            accent,
          )}
        >
          <Icon className="h-4 w-4" />
          {label}
        </div>
        <div className="flex items-baseline gap-1">
          <span className="text-3xl font-semibold tabular-nums">{value}</span>
          {unit && <span className="text-sm text-muted-foreground">{unit}</span>}
        </div>
        {subMetrics && (
          <div className="mt-1 flex w-full items-center justify-center gap-4 text-xs tabular-nums">
            <span className={cn("flex items-center gap-1", subMetrics.downloadAccent)}>
              <Download className="h-3 w-3" />
              {subMetrics.download}
            </span>
            <span className={cn("flex items-center gap-1", subMetrics.uploadAccent)}>
              <Upload className="h-3 w-3" />
              {subMetrics.upload}
            </span>
          </div>
        )}
        {active && (
          <div className="absolute inset-x-0 bottom-0 h-0.5 bg-muted">
            <div
              className="h-full w-full origin-left bg-primary"
              style={{
                transform: `scaleX(${Math.max(0, Math.min(1, phaseProgress ?? 0))})`,
                transition: "transform 0.2s ease-out",
                willChange: "transform",
              }}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
});

export const SpeedMetricsGrid = memo(function SpeedMetricsGrid({
  values,
  activePhase,
  phaseProgress,
}: {
  values: SpeedMetricValues;
  activePhase?: SpeedtestPhase | null;
  phaseProgress?: number;
}) {
  const { t } = useI18n();
  const active = (phase: SpeedtestPhase) => activePhase === phase;
  const empty = t("common.emptyValue");
  const mbps = t("common.unit.mbps");

  const fmtMs = (v: number | null) => (v != null ? formatMs(v) : empty);

  return (
    <div className="grid shrink-0 gap-2 sm:grid-cols-4">
      <Metric
        icon={Download}
        label={t("speedtest.metrics.download")}
        value={formatMbps(values.downloadMbps, empty)}
        unit={mbps}
        accent="text-orange-500"
        active={active("download")}
        phaseProgress={phaseProgress}
      />
      <Metric
        icon={Upload}
        label={t("speedtest.metrics.upload")}
        value={formatMbps(values.uploadMbps, empty)}
        unit={mbps}
        accent="text-violet-500"
        active={active("upload")}
        phaseProgress={phaseProgress}
      />
      <Metric
        icon={Timer}
        label={t("speedtest.metrics.latency")}
        value={values.latencyMs != null ? formatMs(values.latencyMs) : empty}
        unit=""
        accent="text-muted-foreground"
        active={active("latency")}
        phaseProgress={phaseProgress}
        subMetrics={{
          download: fmtMs(values.latency.download),
          upload: fmtMs(values.latency.upload),
          downloadAccent: "text-orange-500",
          uploadAccent: "text-violet-500",
        }}
      />
      <Metric
        icon={Waves}
        label={t("speedtest.metrics.jitter")}
        value={values.jitterMs != null ? formatMs(values.jitterMs) : empty}
        unit=""
        accent="text-muted-foreground"
        active={active("latency")}
        phaseProgress={phaseProgress}
        subMetrics={{
          download: fmtMs(values.jitter.download),
          upload: fmtMs(values.jitter.upload),
          downloadAccent: "text-orange-500",
          uploadAccent: "text-violet-500",
        }}
      />
    </div>
  );
});

export function speedMetricValues(
  progress: SpeedtestProgress | null,
  result: SpeedtestResult | null,
): SpeedMetricValues {
  const src = result ?? progress;
  if (!src) {
    return {
      downloadMbps: null,
      uploadMbps: null,
      latencyMs: null,
      jitterMs: null,
      latency: { download: null, upload: null },
      jitter: { download: null, upload: null },
    };
  }

  return {
    downloadMbps: src.downloadMbps ?? null,
    uploadMbps: src.uploadMbps ?? null,
    latencyMs: src.latencyMs ?? null,
    jitterMs: src.jitterMs ?? null,
    latency: {
      download: src.downloadLatencyMs ?? null,
      upload: src.uploadLatencyMs ?? null,
    },
    jitter: {
      download: src.downloadJitterMs ?? null,
      upload: src.uploadJitterMs ?? null,
    },
  };
}

function SpeedtestToolbar({
  busy,
  onRun,
  onOpenSettings,
}: {
  busy: boolean;
  onRun: () => void;
  onOpenSettings: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="flex items-center justify-start gap-3">
      <Button size="sm" onClick={onRun} disabled={busy}>
        <Gauge className="h-4 w-4" />
        {busy ? t("speedtest.form.testing") : t("speedtest.form.run")}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        aria-label={t("common.settings")}
        onClick={onOpenSettings}
      >
        <SlidersHorizontal className="h-4 w-4" />
        {t("common.settings")}
      </Button>
    </div>
  );
}

export function SpeedtestTest() {
  const { t } = useI18n();
  const location = useLocation();
  const navigate = useNavigate();
  const [showSettings, setShowSettings] = useState(false);
  const { execute, status, progress, result } = useSpeedtest();
  const running = status === "running" || status === "analyzing";
  const failed = !running && result?.status === "failed";
  const autoStartedRef = useRef(false);

  const {
    execute: runTrace,
    status: traceStatus,
    result: traceResult,
  } = useTraceroute();
  const traceHost = useTracerouteSettingsStore((s) => s.traceHost);
  const traceMaxHops = useTracerouteSettingsStore((s) => s.traceMaxHops);
  const tracing = traceStatus === "running" || traceStatus === "analyzing";

  const startInternetTest = useCallback(() => {
    useTracerouteStore.getState().setResult(null);
    void execute();
    void runTrace(traceHost, traceMaxHops);
  }, [execute, runTrace, traceHost, traceMaxHops]);

  // Home → Internet Test with autoRun: start speedtest + traceroute once.
  useEffect(() => {
    const state = location.state as SpeedtestLocationState | null;
    if (!state?.autoRun || autoStartedRef.current || running || tracing) return;
    autoStartedRef.current = true;
    startInternetTest();
    navigate(location.pathname, { replace: true, state: null });
  }, [location.pathname, location.state, navigate, running, tracing, startInternetTest]);

  const metricValues = speedMetricValues(running ? progress : null, running ? null : result);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
      <div className="shrink-0">
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="flex items-center justify-between gap-4">
              <SpeedtestToolbar
                busy={running || tracing}
                onRun={startInternetTest}
                onOpenSettings={() => setShowSettings(true)}
              />
              <StatusIndicator status={status} />
            </div>

            {failed ? (
              <p className="text-sm text-destructive">
                {result?.error ?? t("speedtest.failed")}
              </p>
            ) : null}

            <SpeedMetricsGrid
              values={metricValues}
              activePhase={running ? progress?.phase : null}
              phaseProgress={progress?.progress}
            />
          </CardContent>
        </Card>
      </div>

      <TracerouteResults
        className="min-h-0 flex-1"
        result={traceResult}
        running={tracing}
        target={traceHost}
        onRefresh={() => void runTrace(traceHost, traceMaxHops)}
      />

      <SettingsDialog
        open={showSettings}
        onClose={() => setShowSettings(false)}
        defaultTab="internet"
      />
    </div>
  );
}
