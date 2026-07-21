import { memo, useEffect, useState } from "react";
import { Radar, Monitor, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useScan } from "@/hooks/useScan";
import { useI18n } from "@/hooks/useI18n";
import { formatMs, cn } from "@/lib/utils";
import type { DiscoveredDevice, ScanResult, TestStatus } from "@/lib/types";
import { StatusIndicator } from "./StatusIndicator";

/** Columns can shrink below content width so `truncate` ellipsis works. */
const SCAN_GRID =
  "grid grid-cols-[minmax(0,3fr)_minmax(0,3fr)_minmax(0,3fr)_minmax(0,1fr)_minmax(0,2fr)] items-center gap-2";

function TruncatedCell({
  value,
  className,
}: {
  value: string;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 overflow-hidden", className)} title={value}>
      <span className="block truncate">{value}</span>
    </div>
  );
}

/** Isolated form — typing only re-renders this lightweight subtree. */
function ScanForm({
  status,
  initialCidr,
  onSubmit,
}: {
  status: TestStatus;
  initialCidr: string;
  onSubmit: (cidr: string) => void;
}) {
  const { t } = useI18n();
  const [cidr, setCidr] = useState(initialCidr);
  const busy = status === "running" || status === "analyzing";

  useEffect(() => {
    if (initialCidr && !cidr) setCidr(initialCidr);
  }, [initialCidr, cidr]);

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between gap-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onSubmit(cidr.trim());
            }}
            className="flex min-w-0 flex-1 items-stretch gap-3"
          >
            <div className="flex shrink-0 self-stretch">
              <Button type="submit" disabled={busy} className="h-full px-4">
                <Radar className="h-4 w-4" />
                {busy ? t("scan.form.scanning") : t("scan.form.scan")}
              </Button>
            </div>
            <div className="min-w-0 flex-1 space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                {t("scan.form.subnetLabel")}
              </label>
              <Input
                value={cidr}
                onChange={(e) => setCidr(e.target.value)}
                placeholder={t("scan.form.subnetPlaceholder")}
                disabled={busy}
                autoComplete="off"
                spellCheck={false}
              />
            </div>
          </form>
          <StatusIndicator status={status} />
        </div>
      </CardContent>
    </Card>
  );
}

const DeviceRow = memo(function DeviceRow({
  device,
  emptyValue,
}: {
  device: DiscoveredDevice;
  emptyValue: string;
}) {
  return (
    <div
      className={cn(SCAN_GRID, "border-b border-border/60 px-4 py-2.5 text-left text-sm last:border-0")}
      style={{ contain: "layout paint" }}
    >
      <div className="flex min-w-0 items-center justify-start gap-2 overflow-hidden text-left font-medium tabular-nums">
        <Monitor className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 truncate" title={device.ip}>
          {device.ip}
        </span>
      </div>
      <TruncatedCell
        value={device.mac ?? emptyValue}
        className="text-left font-mono text-xs text-muted-foreground"
      />
      <TruncatedCell
        value={device.hostname ?? emptyValue}
        className="text-left text-muted-foreground"
      />
      <TruncatedCell
        value={formatMs(device.latencyMs)}
        className="text-left tabular-nums text-muted-foreground"
      />
      <TruncatedCell
        value={device.vendor ?? emptyValue}
        className="text-left text-muted-foreground"
      />
    </div>
  );
});

/** Memoized results — unaffected by form keystrokes. */
const ScanResults = memo(function ScanResults({
  result,
  status,
  lastCidr,
  onRefresh,
}: {
  result: ScanResult | null;
  status: TestStatus;
  lastCidr: string;
  onRefresh: () => void;
}) {
  const { t } = useI18n();
  const busy = status === "running" || status === "analyzing";
  if (!result && !busy) return null;

  const displayTarget = result?.target ?? (lastCidr || t("scan.form.subnetPlaceholder"));

  return (
    <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <CardHeader className="shrink-0 flex-row items-start space-y-0">
        <div className="min-w-0">
          <div className="flex items-center justify-start gap-2">
            <CardTitle className="text-left text-base">{displayTarget}</CardTitle>
            <Button
              size="sm"
              variant="ghost"
              className="hover-spin-trigger h-8 w-8 shrink-0 p-0"
              disabled={busy}
              aria-label={t("scan.results.refresh")}
              onClick={onRefresh}
            >
              <RefreshCw className={cn("h-4 w-4", busy ? "animate-spin" : "hover-spin-slow")} />
            </Button>
          </div>
          {result && result.status !== "failed" && (
            <p className="mt-1 text-left text-xs text-muted-foreground">
              {t("scan.results.summary", {
                count: result.devices.length,
                durationMs: result.durationMs,
              })}
            </p>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col overflow-hidden pt-0">
        {busy && !result ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {t("scan.form.scanning")}
          </p>
        ) : result?.status === "failed" ? (
          <p className="text-sm text-destructive">
            {result.error ?? t("scan.results.failed")}
          </p>
        ) : !result || result.devices.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {t("scan.results.empty")}
          </p>
        ) : (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-border/60">
            <div
              className={cn(
                SCAN_GRID,
                "shrink-0 border-b border-border bg-muted/40 px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground",
              )}
            >
              <div className="min-w-0 truncate">{t("scan.columns.ip")}</div>
              <div className="min-w-0 truncate">{t("scan.columns.mac")}</div>
              <div className="min-w-0 truncate">{t("scan.columns.hostname")}</div>
              <div className="min-w-0 truncate">{t("scan.columns.rtt")}</div>
              <div className="min-w-0 truncate">{t("scan.columns.vendor")}</div>
            </div>
            <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden">
              {result.devices.map((d) => (
                <DeviceRow key={d.ip} device={d} emptyValue={t("common.emptyValue")} />
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
});

export function ScanTest() {
  const { execute, refresh, status, result, lastCidr } = useScan();

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
      <div className="shrink-0">
        <ScanForm status={status} initialCidr={lastCidr} onSubmit={execute} />
      </div>
      <ScanResults
        result={result}
        status={status}
        lastCidr={lastCidr}
        onRefresh={() => void refresh()}
      />
    </div>
  );
}
