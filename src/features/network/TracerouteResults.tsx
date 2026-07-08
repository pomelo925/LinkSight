import { memo } from "react";
import { Route, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useI18n } from "@/hooks/useI18n";
import { cn } from "@/lib/utils";
import type { TraceHop, TracerouteResult } from "@/lib/types";

function avgRtt(hop: TraceHop): number | null {
  if (hop.rttsMs.length === 0) return null;
  return hop.rttsMs.reduce((sum, v) => sum + v, 0) / hop.rttsMs.length;
}

/** Color a hop by its RTT (green = fast, amber = slow, red = very slow). */
function rttTone(rtt: number | null): string {
  if (rtt == null) return "text-muted-foreground";
  if (rtt < 30) return "text-success";
  if (rtt < 90) return "text-yellow-500";
  return "text-destructive";
}

const HopRow = memo(function HopRow({
  hop,
  emptyValue,
}: {
  hop: TraceHop;
  emptyValue: string;
}) {
  const { t } = useI18n();
  const rtt = avgRtt(hop);
  return (
    <div
      className="grid grid-cols-12 items-center gap-2 border-b border-border/60 px-4 py-2.5 text-sm last:border-0"
      style={{ contain: "layout paint" }}
    >
      <div className="col-span-1 flex items-center gap-2 font-medium tabular-nums">
        <span
          className={cn(
            "inline-block h-2 w-2 shrink-0 rounded-full",
            hop.timedOut
              ? "bg-muted"
              : rtt == null
                ? "bg-muted"
                : rtt < 30
                  ? "bg-success"
                  : rtt < 90
                    ? "bg-yellow-500"
                    : "bg-destructive",
          )}
        />
        {hop.ttl}
      </div>
      <div className="col-span-5 min-w-0 truncate text-muted-foreground">
        {hop.timedOut
          ? t("traceroute.hop.timedOut")
          : (hop.host ?? emptyValue)}
      </div>
      <div className="col-span-4 min-w-0 truncate font-mono text-xs text-muted-foreground">
        {hop.ip ?? emptyValue}
      </div>
      <div className={cn("col-span-2 min-w-0 truncate text-right tabular-nums", rttTone(rtt))}>
        {hop.timedOut
          ? t("traceroute.hop.timeout")
          : rtt != null
            ? t("traceroute.hop.rtt", { rtt: rtt.toFixed(0) })
            : emptyValue}
      </div>
    </div>
  );
});

/**
 * Traceroute result rendered as an IP-style table (one row per hop), mirroring
 * the LAN-scan device table for a consistent look.
 */
export const TracerouteResults = memo(function TracerouteResults({
  result,
  running,
  target,
  className,
  onRefresh,
}: {
  result: TracerouteResult | null;
  running: boolean;
  /** Shown in the header while no result is available yet. */
  target?: string;
  className?: string;
  onRefresh?: () => void;
}) {
  const { t } = useI18n();
  const empty = t("common.emptyValue");
  const displayTarget = result?.target ?? target ?? t("traceroute.targetFallback");
  const finalHopRtt =
    result && result.hops.length > 0 ? avgRtt(result.hops[result.hops.length - 1]) : null;

  return (
    <Card className={cn("flex min-h-0 flex-col overflow-hidden", className)}>
      <CardHeader className="shrink-0 flex-row items-start justify-between space-y-0">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Route className="h-4 w-4 shrink-0 text-muted-foreground" />
              {t("traceroute.title", { target: displayTarget })}
            </CardTitle>
            {onRefresh ? (
              <Button
                size="sm"
                variant="ghost"
                className="hover-spin-trigger h-8 w-8 shrink-0 p-0"
                disabled={running}
                aria-label={t("scan.results.refresh")}
                onClick={onRefresh}
              >
                <RefreshCw className={cn("h-4 w-4", running ? "animate-spin" : "hover-spin-slow")} />
              </Button>
            ) : null}
          </div>
          {result && result.status !== "failed" && result.hops.length > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              {t("traceroute.summary", {
                hops: result.hops.length,
                rtt: finalHopRtt != null ? finalHopRtt.toFixed(0) : "—",
                duration: result.durationMs,
              })}
            </p>
          )}
        </div>
        {running ? (
          <Badge variant="secondary">{t("traceroute.tracing")}</Badge>
        ) : result && result.status !== "failed" && result.hops.length > 0 ? (
          <Badge variant="success">{t("scan.results.complete")}</Badge>
        ) : null}
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col overflow-hidden pt-0">
        {running && !result ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {t("traceroute.discovering")}
          </p>
        ) : !result ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {t("traceroute.empty")}
          </p>
        ) : result.status === "failed" ? (
          <p className="py-6 text-center text-sm text-destructive">
            {result.error ?? t("traceroute.failed")}
          </p>
        ) : result.hops.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {t("traceroute.noHops")}
          </p>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border/60">
            <div className="grid shrink-0 grid-cols-12 gap-2 border-b border-border bg-muted/40 px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <div className="col-span-1">{t("traceroute.columns.hop")}</div>
              <div className="col-span-5">{t("traceroute.columns.host")}</div>
              <div className="col-span-4">{t("traceroute.columns.ip")}</div>
              <div className="col-span-2 text-right">{t("traceroute.columns.rtt")}</div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {result.hops.map((hop) => (
                <HopRow key={hop.ttl} hop={hop} emptyValue={empty} />
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
});
