import { memo, useState } from "react";
import { Radar, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useScan } from "@/hooks/useScan";
import { useI18n } from "@/hooks/useI18n";
import { formatMs } from "@/lib/utils";
import type { DiscoveredDevice, ScanResult, TestStatus } from "@/lib/types";
import { StatusIndicator } from "./StatusIndicator";

/** Isolated form — typing only re-renders this lightweight subtree. */
function ScanForm({
  status,
  onSubmit,
}: {
  status: TestStatus;
  onSubmit: (cidr: string) => void;
}) {
  const { t } = useI18n();
  const [cidr, setCidr] = useState("");
  const busy = status === "running" || status === "analyzing";

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>{t("scan.form.title")}</CardTitle>
        <StatusIndicator status={status} />
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit(cidr.trim());
          }}
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
        >
          <div className="flex-1 space-y-1.5">
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
          <Button type="submit" disabled={busy} className="sm:w-32">
            <Radar className="h-4 w-4" />
            {busy ? t("scan.form.scanning") : t("scan.form.scan")}
          </Button>
        </form>
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
      className="grid grid-cols-12 items-center gap-2 border-b border-border/60 px-4 py-2.5 text-sm last:border-0"
      style={{ contain: "layout paint" }}
    >
      <div className="col-span-3 flex min-w-0 items-center gap-2 font-medium tabular-nums">
        <Monitor className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="truncate">{device.ip}</span>
      </div>
      <div className="col-span-3 min-w-0 truncate font-mono text-xs text-muted-foreground">
        {device.mac ?? emptyValue}
      </div>
      <div className="col-span-3 min-w-0 truncate text-muted-foreground">
        {device.hostname ?? emptyValue}
      </div>
      <div className="col-span-1 min-w-0 truncate tabular-nums text-muted-foreground">
        {formatMs(device.latencyMs)}
      </div>
      <div className="col-span-2 min-w-0 truncate text-muted-foreground">
        {device.vendor ?? emptyValue}
      </div>
    </div>
  );
});

/** Memoized results — unaffected by form keystrokes. */
const ScanResults = memo(function ScanResults({
  result,
}: {
  result: ScanResult | null;
}) {
  const { t } = useI18n();
  if (!result) return null;

  return (
    <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <CardHeader className="shrink-0 flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-base">{result.target}</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("scan.results.summary", {
              count: result.devices.length,
              durationMs: result.durationMs,
            })}
          </p>
        </div>
        <Badge variant={result.status === "failed" ? "destructive" : "success"}>
          {result.status === "failed"
            ? t("scan.results.failed")
            : t("scan.results.complete")}
        </Badge>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col overflow-hidden pt-0">
        {result.status === "failed" ? (
          <p className="text-sm text-destructive">
            {result.error ?? t("scan.results.failed")}
          </p>
        ) : result.devices.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {t("scan.results.empty")}
          </p>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border/60">
            <div className="grid shrink-0 grid-cols-12 gap-2 border-b border-border bg-muted/40 px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <div className="col-span-3">{t("scan.columns.ip")}</div>
              <div className="col-span-3">{t("scan.columns.mac")}</div>
              <div className="col-span-3">{t("scan.columns.hostname")}</div>
              <div className="col-span-1">{t("scan.columns.rtt")}</div>
              <div className="col-span-2">{t("scan.columns.vendor")}</div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
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
  const { execute, status, result } = useScan();

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
      <div className="shrink-0">
        <ScanForm status={status} onSubmit={execute} />
      </div>
      <ScanResults result={result} />
    </div>
  );
}
