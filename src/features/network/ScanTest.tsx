import { memo, useState } from "react";
import { Radar, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useScan } from "@/hooks/useScan";
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
  const [cidr, setCidr] = useState("");
  const busy = status === "running" || status === "analyzing";

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>LAN Scan</CardTitle>
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
              Subnet (CIDR) — leave empty to auto-detect
            </label>
            <Input
              value={cidr}
              onChange={(e) => setCidr(e.target.value)}
              placeholder="e.g. 192.168.1.0/24"
              disabled={busy}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <Button type="submit" disabled={busy} className="sm:w-32">
            <Radar className="h-4 w-4" />
            {busy ? "Scanning…" : "Scan"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

const DeviceRow = memo(function DeviceRow({
  device,
}: {
  device: DiscoveredDevice;
}) {
  return (
    <div
      className="grid grid-cols-12 items-center gap-2 border-b border-border/60 px-4 py-2.5 text-sm last:border-0"
      style={{ contain: "layout paint" }}
    >
      <div className="col-span-3 flex items-center gap-2 font-medium tabular-nums">
        <Monitor className="h-4 w-4 text-muted-foreground" />
        {device.ip}
      </div>
      <div className="col-span-3 truncate text-muted-foreground">
        {device.hostname ?? "—"}
      </div>
      <div className="col-span-3 truncate font-mono text-xs text-muted-foreground">
        {device.mac ?? "—"}
      </div>
      <div className="col-span-2 truncate text-muted-foreground">
        {device.vendor ?? "—"}
      </div>
      <div className="col-span-1 text-right tabular-nums text-muted-foreground">
        {formatMs(device.latencyMs)}
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
  if (!result) return null;

  return (
    <div>
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-base">{result.target}</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                {result.devices.length} host
                {result.devices.length === 1 ? "" : "s"} up · {result.durationMs}{" "}
                ms
              </p>
            </div>
            <Badge
              variant={result.status === "failed" ? "destructive" : "success"}
            >
              {result.status === "failed" ? "Failed" : "Complete"}
            </Badge>
          </CardHeader>
          <CardContent>
            {result.status === "failed" ? (
              <p className="text-sm text-destructive">
                {result.error ?? "Scan failed"}
              </p>
            ) : result.devices.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No hosts responded on this subnet.
              </p>
            ) : (
              <div className="overflow-hidden rounded-lg border border-border/60">
                <div className="grid grid-cols-12 gap-2 border-b border-border bg-muted/40 px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <div className="col-span-3">IP</div>
                  <div className="col-span-3">Hostname</div>
                  <div className="col-span-3">MAC</div>
                  <div className="col-span-2">Vendor</div>
                  <div className="col-span-1 text-right">RTT</div>
                </div>
                {result.devices.map((d) => (
                  <DeviceRow key={d.ip} device={d} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
    </div>
  );
});

export function ScanTest() {
  const { execute, status, result } = useScan();

  return (
    <div className="space-y-6">
      <ScanForm status={status} onSubmit={execute} />
      <ScanResults result={result} />
    </div>
  );
}
