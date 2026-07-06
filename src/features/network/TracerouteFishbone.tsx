import { memo } from "react";
import { Route } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useI18n } from "@/hooks/useI18n";
import { cn } from "@/lib/utils";
import type { TraceHop, TracerouteResult } from "@/lib/types";

function bestRtt(hop: TraceHop): number | null {
  if (hop.rttsMs.length === 0) return null;
  return Math.min(...hop.rttsMs);
}

/** Color a hop by its RTT (green = fast, amber = slow, red = very slow). */
function rttTone(rtt: number | null): string {
  if (rtt == null) return "text-muted-foreground";
  if (rtt < 30) return "text-success";
  if (rtt < 90) return "text-yellow-500";
  return "text-destructive";
}

// NOTE: no box-shadow glows here — dozens of shadows are expensive to paint
// under WebKitGTK software rendering and make the whole page feel frozen.
function dotTone(rtt: number | null, timedOut: boolean): string {
  if (timedOut) return "border-border bg-muted";
  if (rtt == null) return "border-border bg-muted";
  if (rtt < 30) return "border-success bg-success/30";
  if (rtt < 90) return "border-yellow-500 bg-yellow-500/30";
  return "border-destructive bg-destructive/30";
}

/** End-point pill ("You" / target), styled like the reference route map. */
function EndpointPill({ label }: { label: string }) {
  return (
    <div className="z-10 shrink-0 rounded-full border border-success/60 bg-card px-4 py-1.5 text-sm font-semibold">
      {label}
    </div>
  );
}

/** One node on the spine; the badge alternates above / below (fishbone). */
const HopNode = memo(function HopNode({
  hop,
  above,
}: {
  hop: TraceHop;
  above: boolean;
}) {
  const { t } = useI18n();
  const rtt = bestRtt(hop);
  const title = hop.timedOut
    ? t("traceroute.hop.noResponse", { ttl: hop.ttl })
    : t("traceroute.hop.detail", {
        ttl: hop.ttl,
        host: hop.host ?? hop.ip ?? t("traceroute.hop.unknown"),
        ip: hop.ip ?? "",
      });

  return (
    <div className="relative flex h-24 min-w-14 flex-1 items-center justify-center" title={title}>
      {/* spine segment */}
      <div className="absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 bg-gradient-to-r from-success/50 to-success/50" />
      {/* node */}
      <div
        className={cn(
          "z-10 h-3.5 w-3.5 rounded-full border-2",
          dotTone(rtt, hop.timedOut),
        )}
      />
      {/* rib + badge */}
      <div
        className={cn(
          "absolute left-1/2 flex -translate-x-1/2 flex-col items-center",
          above ? "bottom-1/2 mb-2" : "top-1/2 mt-2",
        )}
      >
        {!above && <div className="h-2 w-px bg-border" />}
        <div className="whitespace-nowrap rounded-md border border-border/70 bg-card/95 px-2 py-1 text-center leading-tight">
          <span className="block text-[10px] text-muted-foreground">
            #{hop.ttl}
          </span>
          <span className={cn("block text-xs font-semibold tabular-nums", rttTone(rtt))}>
            {hop.timedOut
              ? t("traceroute.hop.timeout")
              : rtt != null
                ? t("traceroute.hop.rtt", { rtt: rtt.toFixed(0) })
                : t("common.emptyValue")}
          </span>
        </div>
        {above && <div className="h-2 w-px bg-border" />}
      </div>
    </div>
  );
});

/**
 * Route-map ("fishbone") visualization of a traceroute: You ── hops ── target,
 * with per-hop RTT badges alternating above / below the spine.
 */
export const TracerouteFishbone = memo(function TracerouteFishbone({
  result,
  running,
  target,
}: {
  result: TracerouteResult | null;
  running: boolean;
  /** Shown in the header while no result is available yet. */
  target?: string;
}) {
  const { t } = useI18n();
  const responsive = result?.hops.filter((h) => !h.timedOut) ?? [];
  const finalHop = responsive.length > 0 ? responsive[responsive.length - 1] : null;
  const finalRtt = finalHop ? bestRtt(finalHop) : null;
  const displayTarget = result?.target ?? target ?? t("traceroute.targetFallback");

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <Route className="h-4 w-4 text-muted-foreground" />
          {t("traceroute.title", { target: displayTarget })}
        </CardTitle>
        {running ? (
          // Static indicator on purpose: an animated spinner here would run
          // for the whole trace (tens of seconds) and starve the
          // software-rendered webview, making clicks feel frozen.
          <span className="text-sm text-primary">{t("traceroute.tracing")}</span>
        ) : finalRtt != null ? (
          <div className="rounded-lg border border-border/70 bg-muted/30 px-3 py-1.5 text-right">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {t("traceroute.finalHop")}
            </p>
            <p className={cn("text-sm font-semibold tabular-nums", rttTone(finalRtt))}>
              {t("traceroute.hop.rtt", { rtt: finalRtt.toFixed(0) })}
            </p>
          </div>
        ) : null}
      </CardHeader>
      {/* Fixed-height body so the page layout never shifts between the idle,
          loading and result states. */}
      <CardContent className="flex min-h-[10.5rem] flex-col justify-center">
        {running && !result ? (
          <p className="text-center text-sm text-muted-foreground">
            {t("traceroute.discovering")}
          </p>
        ) : !result ? (
          <p className="text-center text-sm text-muted-foreground">
            {t("traceroute.empty")}
          </p>
        ) : result.status === "failed" ? (
          <p className="text-center text-sm text-destructive">
            {result.error ?? t("traceroute.failed")}
          </p>
        ) : result.hops.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground">
            {t("traceroute.noHops")}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <div className="flex min-w-max items-center px-2 py-3">
              <EndpointPill label={t("traceroute.endpoint.you")} />
              {result.hops.map((hop, i) => (
                <HopNode key={hop.ttl} hop={hop} above={i % 2 === 0} />
              ))}
              <EndpointPill label={result.target} />
            </div>
            <p className="pb-1 text-center text-xs text-muted-foreground">
              {t("traceroute.summary", {
                hops: result.hops.length,
                ms: result.durationMs,
              })}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
});
