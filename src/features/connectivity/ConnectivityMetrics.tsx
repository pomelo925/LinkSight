import { memo } from "react";
import {
  Download,
  Upload,
  Timer,
  Hourglass,
  Waves,
  AlertTriangle,
  Ruler,
  Plug,
  Route,
  Package,
  type LucideIcon,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { InfoHint } from "@/components/ui/info-hint";
import { useI18n } from "@/hooks/useI18n";
import { cn } from "@/lib/utils";
import type {
  ConnectivityPhase,
  ConnectivityProgress,
  ConnectivityResult,
} from "@/lib/types";

const num1 = (v: number | null, empty: string): string =>
  v == null ? empty : v.toFixed(1);
const int = (v: number | null, empty: string): string =>
  v == null ? empty : Math.round(v).toString();

/** Bandwidth-delay product: raw bytes → a compact KB/MB string. */
function formatBdp(
  bytes: number | null,
  empty: string,
  kbUnit: string,
  mbUnit: string,
): { value: string; unit: string } {
  if (bytes == null) return { value: empty, unit: "" };
  if (bytes >= 1024 * 1024)
    return { value: (bytes / (1024 * 1024)).toFixed(1), unit: mbUnit };
  return { value: (bytes / 1024).toFixed(1), unit: kbUnit };
}

interface MetricProps {
  icon: LucideIcon;
  label: string;
  value: string;
  unit: string;
  sub?: string | null;
  accent: string;
  active?: boolean;
  phaseProgress?: number;
  infoBody: string;
  infoAria: string;
}

const Metric = memo(function Metric({
  icon: Icon,
  label,
  value,
  unit,
  sub,
  accent,
  active,
  phaseProgress,
  infoBody,
  infoAria,
}: MetricProps) {
  return (
    <Card className={cn("[contain:content]", active && "border-primary/60")}>
      <CardContent className="relative flex flex-col items-center gap-1 overflow-hidden py-5 text-center">
        <div className="absolute right-2 top-2 z-10">
          <InfoHint
            align="end"
            ariaLabel={infoAria}
            title={label}
            body={infoBody}
          />
        </div>
        <div
          className={cn(
            "flex items-center gap-2 text-xs font-medium uppercase tracking-wide",
            accent,
          )}
        >
          <Icon className="h-4 w-4" />
          {label}
        </div>
        <div className="mt-1 flex items-baseline gap-1">
          <span className="text-3xl font-semibold tabular-nums">{value}</span>
          {unit && <span className="text-sm text-muted-foreground">{unit}</span>}
        </div>
        <span className="h-4 text-xs text-muted-foreground">{sub ?? ""}</span>
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

export interface ConnectivityMetricValues {
  rttMinMs: number | null;
  rttAvgMs: number | null;
  rttMaxMs: number | null;
  delayMs: number | null;
  jitterMs: number | null;
  packetLossPct: number | null;
  maxPayloadBytes: number | null;
  pathMtuBytes: number | null;
  hops: number | null;
  handshakeMs: number | null;
  uplinkMbps: number | null;
  downlinkMbps: number | null;
  bdpBytes: number | null;
}

/** Pull displayable values from live progress or the final result. */
export function connectivityMetricValues(
  progress: ConnectivityProgress | null,
  result: ConnectivityResult | null,
): ConnectivityMetricValues {
  const src = result ?? progress;
  return {
    rttMinMs: src?.rttMinMs ?? null,
    rttAvgMs: src?.rttAvgMs ?? null,
    rttMaxMs: src?.rttMaxMs ?? null,
    delayMs: src?.delayMs ?? null,
    jitterMs: src?.jitterMs ?? null,
    packetLossPct: src?.packetLossPct ?? null,
    maxPayloadBytes: src?.maxPayloadBytes ?? null,
    pathMtuBytes: src?.pathMtuBytes ?? null,
    hops: src?.hops ?? null,
    handshakeMs: src?.handshakeMs ?? null,
    uplinkMbps: src?.uplinkMbps ?? null,
    downlinkMbps: src?.downlinkMbps ?? null,
    bdpBytes: src?.bdpBytes ?? null,
  };
}

export const ConnectivityMetricsGrid = memo(function ConnectivityMetricsGrid({
  values,
  activePhase,
  phaseProgress,
}: {
  values: ConnectivityMetricValues;
  activePhase?: ConnectivityPhase | null;
  phaseProgress?: number;
}) {
  const { t } = useI18n();
  const on = (...phases: ConnectivityPhase[]) =>
    activePhase != null && phases.includes(activePhase);
  const empty = t("common.emptyValue");
  const ms = t("common.unit.ms");
  const mbps = t("common.unit.mbps");
  const percent = t("common.unit.percent");
  const bUnit = t("common.unit.b");
  const bdp = formatBdp(
    values.bdpBytes,
    empty,
    t("common.unit.kb"),
    t("common.unit.mb"),
  );

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {/* Direct measurements (test phase order) */}
      <Metric
        icon={Plug}
        label={t("connectivity.metrics.handshake")}
        value={num1(values.handshakeMs, empty)}
        unit={ms}
        sub={t("connectivity.metrics.handshakeHint")}
        accent="text-muted-foreground"
        active={on("handshake")}
        phaseProgress={phaseProgress}
        infoAria={t("connectivity.metrics.info.aria", {
          metric: t("connectivity.metrics.handshake"),
        })}
        infoBody={t("connectivity.metrics.info.handshake")}
      />
      <Metric
        icon={Timer}
        label={t("connectivity.metrics.rttAvg")}
        value={num1(values.rttAvgMs, empty)}
        unit={ms}
        sub={
          values.rttMinMs != null && values.rttMaxMs != null
            ? t("connectivity.metrics.rttRange", {
                min: values.rttMinMs.toFixed(1),
                max: values.rttMaxMs.toFixed(1),
              })
            : null
        }
        accent="text-muted-foreground"
        active={on("ping")}
        phaseProgress={phaseProgress}
        infoAria={t("connectivity.metrics.info.aria", {
          metric: t("connectivity.metrics.rttAvg"),
        })}
        infoBody={t("connectivity.metrics.info.rttAvg")}
      />
      <Metric
        icon={Waves}
        label={t("connectivity.metrics.jitter")}
        value={num1(values.jitterMs, empty)}
        unit={ms}
        accent="text-muted-foreground"
        active={on("ping")}
        phaseProgress={phaseProgress}
        infoAria={t("connectivity.metrics.info.aria", {
          metric: t("connectivity.metrics.jitter"),
        })}
        infoBody={t("connectivity.metrics.info.jitter")}
      />
      <Metric
        icon={AlertTriangle}
        label={t("connectivity.metrics.packetLoss")}
        value={values.packetLossPct == null ? empty : values.packetLossPct.toFixed(0)}
        unit={percent}
        accent="text-muted-foreground"
        active={on("ping")}
        phaseProgress={phaseProgress}
        infoAria={t("connectivity.metrics.info.aria", {
          metric: t("connectivity.metrics.packetLoss"),
        })}
        infoBody={t("connectivity.metrics.info.packetLoss")}
      />
      <Metric
        icon={Ruler}
        label={t("connectivity.metrics.pathMtu")}
        value={int(values.pathMtuBytes, empty)}
        unit={bUnit}
        sub={
          values.maxPayloadBytes != null
            ? t("connectivity.metrics.maxPayload", { bytes: values.maxPayloadBytes })
            : null
        }
        accent="text-muted-foreground"
        active={on("mtu")}
        phaseProgress={phaseProgress}
        infoAria={t("connectivity.metrics.info.aria", {
          metric: t("connectivity.metrics.pathMtu"),
        })}
        infoBody={t("connectivity.metrics.info.pathMtu")}
      />
      <Metric
        icon={Route}
        label={t("connectivity.metrics.hops")}
        value={int(values.hops, empty)}
        unit=""
        accent="text-muted-foreground"
        active={on("traceroute")}
        phaseProgress={phaseProgress}
        infoAria={t("connectivity.metrics.info.aria", {
          metric: t("connectivity.metrics.hops"),
        })}
        infoBody={t("connectivity.metrics.info.hops")}
      />
      <Metric
        icon={Upload}
        label={t("connectivity.metrics.uplink")}
        value={num1(values.uplinkMbps, empty)}
        unit={mbps}
        accent="text-success"
        active={on("uplink")}
        phaseProgress={phaseProgress}
        infoAria={t("connectivity.metrics.info.aria", {
          metric: t("connectivity.metrics.uplink"),
        })}
        infoBody={t("connectivity.metrics.info.uplink")}
      />
      <Metric
        icon={Download}
        label={t("connectivity.metrics.downlink")}
        value={num1(values.downlinkMbps, empty)}
        unit={mbps}
        accent="text-primary"
        active={on("downlink")}
        phaseProgress={phaseProgress}
        infoAria={t("connectivity.metrics.info.aria", {
          metric: t("connectivity.metrics.downlink"),
        })}
        infoBody={t("connectivity.metrics.info.downlink")}
      />
      {/* Derived / computed */}
      <Metric
        icon={Hourglass}
        label={t("connectivity.metrics.delay")}
        value={num1(values.delayMs, empty)}
        unit={ms}
        sub={t("connectivity.metrics.delayHint")}
        accent="text-muted-foreground"
        active={on("done")}
        phaseProgress={phaseProgress}
        infoAria={t("connectivity.metrics.info.aria", {
          metric: t("connectivity.metrics.delay"),
        })}
        infoBody={t("connectivity.metrics.info.delay")}
      />
      <Metric
        icon={Package}
        label={t("connectivity.metrics.bdp")}
        value={bdp.value}
        unit={bdp.unit}
        sub={t("connectivity.metrics.bdpHint")}
        accent="text-muted-foreground"
        active={on("done")}
        phaseProgress={phaseProgress}
        infoAria={t("connectivity.metrics.info.aria", {
          metric: t("connectivity.metrics.bdp"),
        })}
        infoBody={t("connectivity.metrics.info.bdp")}
      />
    </div>
  );
});
