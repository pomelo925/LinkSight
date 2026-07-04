import { memo } from "react";
import { Download, Upload, Timer, Waves, Gauge } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useSpeedtest } from "@/hooks/useSpeedtest";
import { formatMs, cn } from "@/lib/utils";
import type {
  SpeedtestPhase,
  SpeedtestProgress,
  SpeedtestResult,
  TestStatus,
} from "@/lib/types";
import { StatusIndicator } from "./StatusIndicator";

function formatMbps(value: number | null | undefined): string {
  if (value == null) return "—";
  return value.toFixed(1);
}

interface MetricProps {
  icon: typeof Download;
  label: string;
  value: string;
  unit: string;
  accent: string;
  /** Currently being measured — highlight and show the phase progress. */
  active?: boolean;
  /** 0–1 progress within the phase (only rendered when active). */
  phaseProgress?: number;
}

const Metric = memo(function Metric({
  icon: Icon,
  label,
  value,
  unit,
  accent,
  active,
  phaseProgress,
}: MetricProps) {
  return (
    <Card className={cn(active && "border-primary/60")}>
      <CardContent className="relative flex flex-col items-center gap-1 overflow-hidden py-6 text-center">
        <div
          className={cn(
            "flex items-center gap-2 text-xs font-medium uppercase tracking-wide",
            accent,
          )}
        >
          {/* No pulse animation — continuous animations starve the
              software-rendered webview during the (long) test. */}
          <Icon className="h-4 w-4" />
          {label}
        </div>
        <div className="mt-1 flex items-baseline gap-1">
          <span className="text-4xl font-semibold tabular-nums">{value}</span>
          {unit && <span className="text-sm text-muted-foreground">{unit}</span>}
        </div>
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

export interface SpeedMetricValues {
  downloadMbps: number | null;
  uploadMbps: number | null;
  latencyMs: number | null;
  jitterMs: number | null;
}

/**
 * The four final result blocks (Download / Upload / Latency / Jitter),
 * rendered immediately and filled in metric-by-metric as phases complete.
 */
export const SpeedMetricsGrid = memo(function SpeedMetricsGrid({
  values,
  activePhase,
  phaseProgress,
}: {
  values: SpeedMetricValues;
  /** Phase currently measuring; highlights the matching block. */
  activePhase?: SpeedtestPhase | null;
  phaseProgress?: number;
}) {
  const active = (phase: SpeedtestPhase) => activePhase === phase;

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Metric
        icon={Download}
        label="Download"
        value={formatMbps(values.downloadMbps)}
        unit="Mbps"
        accent="text-primary"
        active={active("download")}
        phaseProgress={phaseProgress}
      />
      <Metric
        icon={Upload}
        label="Upload"
        value={formatMbps(values.uploadMbps)}
        unit="Mbps"
        accent="text-success"
        active={active("upload")}
        phaseProgress={phaseProgress}
      />
      <Metric
        icon={Timer}
        label="Latency"
        value={values.latencyMs != null ? formatMs(values.latencyMs) : "—"}
        unit=""
        accent="text-muted-foreground"
        active={active("latency")}
        phaseProgress={phaseProgress}
      />
      <Metric
        icon={Waves}
        label="Jitter"
        value={values.jitterMs != null ? formatMs(values.jitterMs) : "—"}
        unit=""
        accent="text-muted-foreground"
        active={active("latency")}
        phaseProgress={phaseProgress}
      />
    </div>
  );
});

/** Extract displayable metric values from live progress or a final result. */
export function speedMetricValues(
  progress: SpeedtestProgress | null,
  result: SpeedtestResult | null,
): SpeedMetricValues {
  if (result) {
    return {
      downloadMbps: result.downloadMbps,
      uploadMbps: result.uploadMbps,
      latencyMs: result.latencyMs,
      jitterMs: result.jitterMs,
    };
  }
  return {
    downloadMbps: progress?.downloadMbps ?? null,
    uploadMbps: progress?.uploadMbps ?? null,
    latencyMs: progress?.latencyMs ?? null,
    jitterMs: progress?.jitterMs ?? null,
  };
}

function SpeedtestControls({
  status,
  onRun,
}: {
  status: TestStatus;
  onRun: () => void;
}) {
  const busy = status === "running" || status === "analyzing";
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>Internet Speed Test</CardTitle>
        <StatusIndicator status={status} />
      </CardHeader>
      <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Measures your connection's download, upload and latency against
          Cloudflare's public speed endpoints.
        </p>
        <Button onClick={onRun} disabled={busy} className="sm:w-40">
          <Gauge className="h-4 w-4" />
          {busy ? "Testing…" : "Run Speed Test"}
        </Button>
      </CardContent>
    </Card>
  );
}

export function SpeedtestTest() {
  const { execute, status, progress, result } = useSpeedtest();
  const running = status === "running" || status === "analyzing";
  const failed = !running && result?.status === "failed";

  return (
    <div className="space-y-6">
      <SpeedtestControls status={status} onRun={() => execute()} />
      {failed ? (
        <Card>
          <CardContent className="py-6">
            <p className="text-sm text-destructive">
              {result?.error ?? "Speed test failed"}
            </p>
          </CardContent>
        </Card>
      ) : running || result ? (
        <SpeedMetricsGrid
          values={speedMetricValues(running ? progress : null, running ? null : result)}
          activePhase={running ? progress?.phase : null}
          phaseProgress={progress?.progress}
        />
      ) : null}
    </div>
  );
}
