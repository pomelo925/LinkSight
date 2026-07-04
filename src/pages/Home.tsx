import { memo, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Monitor,
  Server,
  Plus,
  Gauge,
  Loader2,
  CheckCircle2,
  XCircle,
  ArrowLeftRight,
  Wifi,
  Cable,
  Home as HomeIcon,
} from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useHostStore } from "@/store/useHostStore";
import { useHomeStore } from "@/store/useHomeStore";
import { useSpeedtest } from "@/hooks/useSpeedtest";
import { useTraceroute } from "@/hooks/useTraceroute";
import { useTracerouteStore } from "@/store/useTracerouteStore";
import { listNetworkInterfaces, verifyHost } from "@/lib/api";
import { isTauri } from "@/lib/tauri";
import { formatMs, cn } from "@/lib/utils";
import {
  SpeedMetricsGrid,
  speedMetricValues,
} from "@/features/network/SpeedtestTest";
import { TracerouteFishbone } from "@/features/network/TracerouteFishbone";
import type { HostRecord, InterfaceInfo } from "@/lib/types";

/** Both the speed test and the route trace target Cloudflare's speed endpoint. */
const TEST_TARGET = "speed.cloudflare.com";

/* ---------------------------------- circles ---------------------------------- */

function HostCircle({
  icon: Icon,
  title,
  subtitle,
  dashed,
  onClick,
  children,
}: {
  icon: typeof Monitor;
  title: string;
  subtitle: string;
  dashed?: boolean;
  onClick?: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3">
      <button
        type="button"
        onClick={onClick}
        disabled={!onClick}
        className={cn(
          "flex h-44 w-44 flex-col items-center justify-center gap-2 rounded-full border-2 bg-card text-center",
          dashed
            ? "border-dashed border-border text-muted-foreground transition-colors hover:border-primary hover:text-primary"
            : "border-primary/60",
          onClick && "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
      >
        <Icon className="h-9 w-9" />
        <div className="px-4">
          <p className="text-sm font-semibold leading-tight">{title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </button>
      {children}
    </div>
  );
}

/** Dropdown listing saved hosts for the right circle. */
function HostPicker({
  onPick,
  onClose,
}: {
  onPick: (host: HostRecord) => void;
  onClose: () => void;
}) {
  const hosts = useHostStore((s) => s.hosts);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return (
    <div ref={ref} className="absolute left-1/2 top-full z-20 mt-2 w-64 -translate-x-1/2">
      <Card className="shadow-lg">
        <CardContent className="p-2">
          {hosts.length === 0 ? (
            <div className="space-y-2 p-3 text-center text-sm text-muted-foreground">
              <p>No saved hosts.</p>
              <Button asChild size="sm" variant="secondary">
                <Link to="/hosts">
                  <Plus className="h-4 w-4" />
                  Add a host
                </Link>
              </Button>
            </div>
          ) : (
            <div className="max-h-64 overflow-y-auto">
              {hosts.map((h) => (
                <button
                  key={h.id}
                  type="button"
                  onClick={() => onPick(h)}
                  className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm hover:bg-accent"
                >
                  <Server className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{h.alias}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {h.username}@{h.ip}:{h.port}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ------------------------------- local network ------------------------------- */

const KIND_LABEL: Record<InterfaceInfo["kind"], string> = {
  wifi: "Wi-Fi",
  ethernet: "Ethernet",
  loopback: "Loopback",
  virtual: "Virtual",
};

const LocalNetworkInfo = memo(function LocalNetworkInfo() {
  const [interfaces, setInterfaces] = useState<InterfaceInfo[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isTauri()) return;
    listNetworkInterfaces()
      .then((all) =>
        setInterfaces(all.filter((i) => i.kind === "wifi" || i.kind === "ethernet")),
      )
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  return (
    <div>
      <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
        Local Network
      </h2>
      {error ? (
        <Card>
          <CardContent className="py-4 text-sm text-destructive">{error}</CardContent>
        </Card>
      ) : interfaces.length === 0 ? (
        <Card>
          <CardContent className="py-6 text-center text-sm text-muted-foreground">
            No physical network interfaces detected.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {interfaces.map((iface) => (
            <Card key={iface.name}>
              <CardContent className="flex items-center justify-between gap-3 py-4">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    {iface.kind === "wifi" ? (
                      <Wifi className="h-5 w-5" />
                    ) : (
                      <Cable className="h-5 w-5" />
                    )}
                  </div>
                  <div className="min-w-0 text-sm">
                    <p className="font-medium">
                      {KIND_LABEL[iface.kind]}
                      <span className="ml-2 text-xs text-muted-foreground">
                        {iface.name}
                      </span>
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      IP {iface.ipv4 ?? "—"} · MAC {iface.mac ?? "—"}
                    </p>
                  </div>
                </div>
                <Badge variant={iface.isUp ? "success" : "secondary"}>
                  {iface.isUp ? "Up" : "Down"}
                </Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
});

/* ----------------------------------- page ----------------------------------- */

export function Home() {
  const hostsLoad = useHostStore((s) => s.load);

  const selectedHost = useHomeStore((s) => s.selectedHost);
  const verifyStatus = useHomeStore((s) => s.verifyStatus);
  const verifyResult = useHomeStore((s) => s.verifyResult);
  const selectHost = useHomeStore((s) => s.selectHost);
  const setVerify = useHomeStore((s) => s.setVerify);

  const { execute, status, progress, result } = useSpeedtest();
  const testing = status === "running" || status === "analyzing";

  const {
    execute: runTrace,
    status: traceStatus,
    result: traceResult,
  } = useTraceroute();
  const tracing = traceStatus === "running" || traceStatus === "analyzing";

  /** Speedtest takes over the right side while active or showing its result. */
  const [speedtestView, setSpeedtestView] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    if (isTauri()) hostsLoad().catch(() => undefined);
  }, [hostsLoad]);

  const startSpeedtest = () => {
    setSpeedtestView(true);
    // Clear the previous route so the fishbone shows a fresh trace, then run
    // the speed test and traceroute in parallel against the same target.
    useTracerouteStore.getState().setResult(null);
    void execute();
    void runTrace(TEST_TARGET, 30);
  };

  const pickHost = async (host: HostRecord) => {
    setPickerOpen(false);
    selectHost(host);
    // Quick verification starts automatically after selection.
    setVerify("verifying");
    try {
      const r = await verifyHost(
        host.ip,
        host.port,
        host.username,
        host.password ?? "",
      );
      setVerify(r.authenticated ? "ok" : "failed", r);
    } catch (err) {
      setVerify("failed", {
        reachable: false,
        authenticated: false,
        latencyMs: null,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const speedFailed = !testing && result?.status === "failed";

  return (
    // Full-height column so the Local Network section can pin to the bottom.
    <div className="flex min-h-[calc(100vh-4rem)] flex-col">
      <PageHeader
        title="Home"
        description="Point-to-point connectivity at a glance — local machine on the left, remote peer on the right."
      />

      {/* ---- Top: the two circles / internet-test panel (fixed height) ---- */}
      <Card>
        <CardContent className="py-8">
          <div className="flex min-h-[21rem] flex-col items-center justify-center gap-8 lg:flex-row lg:gap-12">
            {/* Left: always the local machine */}
            <HostCircle
              icon={Monitor}
              title="127.0.0.1"
              subtitle="This machine"
            >
              {!speedtestView && !selectedHost && (
                <Button size="sm" onClick={startSpeedtest}>
                  <Gauge className="h-4 w-4" />
                  Run Internet Test
                </Button>
              )}
            </HostCircle>

            {/* Connector */}
            <div className="hidden items-center text-muted-foreground lg:flex">
              <ArrowLeftRight className="h-6 w-6" />
            </div>

            {/* Right: speedtest panel, selected peer, or host selector */}
            {speedtestView ? (
              <div className="w-full max-w-md space-y-4">
                {speedFailed ? (
                  <Card>
                    <CardContent className="py-6">
                      <p className="text-sm text-destructive">
                        {result?.error ?? "Speed test failed"}
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  // Final result blocks are shown immediately and filled in
                  // metric-by-metric as each phase completes.
                  <SpeedMetricsGrid
                    values={speedMetricValues(
                      testing ? progress : null,
                      testing ? null : result,
                    )}
                    activePhase={testing ? progress?.phase : null}
                    phaseProgress={progress?.progress}
                  />
                )}
                {/* Always occupy the button row so the panel height is stable;
                    it only becomes visible (and clickable) once results are in. */}
                <Button
                  variant="secondary"
                  className={cn(
                    "w-full",
                    (testing || !result) && "invisible",
                  )}
                  onClick={() => setSpeedtestView(false)}
                >
                  <HomeIcon className="h-4 w-4" />
                  Back to home page
                </Button>
              </div>
            ) : selectedHost ? (
              <HostCircle
                icon={Server}
                title={selectedHost.alias}
                subtitle={`${selectedHost.username}@${selectedHost.ip}:${selectedHost.port}`}
              >
                <div className="flex flex-col items-center gap-2">
                  {verifyStatus === "verifying" && (
                    <span className="flex items-center gap-2 text-sm text-primary">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Verifying connection…
                    </span>
                  )}
                  {verifyStatus === "ok" && (
                    <span className="flex items-center gap-2 text-sm text-success">
                      <CheckCircle2 className="h-4 w-4" />
                      Verified
                      {verifyResult?.latencyMs != null &&
                        ` · ${formatMs(verifyResult.latencyMs)}`}
                    </span>
                  )}
                  {verifyStatus === "failed" && (
                    <span
                      className="flex max-w-56 items-center gap-2 text-center text-sm text-destructive"
                      title={verifyResult?.message ?? undefined}
                    >
                      <XCircle className="h-4 w-4 shrink-0" />
                      {verifyResult?.message ?? "Verification failed"}
                    </span>
                  )}
                  <div className="flex gap-2">
                    <Button size="sm" disabled={verifyStatus !== "ok"} title="Coming soon">
                      <ArrowLeftRight className="h-4 w-4" />
                      Connectivity Test
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => selectHost(null)}>
                      Change
                    </Button>
                  </div>
                  {verifyStatus === "ok" && (
                    <p className="text-xs text-muted-foreground">
                      Peer-to-peer testing coming soon.
                    </p>
                  )}
                </div>
              </HostCircle>
            ) : (
              <div className="relative">
                <HostCircle
                  icon={Plus}
                  title="Select host"
                  subtitle="Choose a remote peer"
                  dashed
                  onClick={() => setPickerOpen((v) => !v)}
                />
                {pickerOpen && (
                  <HostPicker onPick={pickHost} onClose={() => setPickerOpen(false)} />
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ---- Middle: route trace (fishbone) — always rendered at a fixed
           height so the sections below never shift. ---- */}
      <div className="mt-6">
        <TracerouteFishbone
          result={speedtestView ? traceResult : null}
          running={speedtestView && tracing}
          target={TEST_TARGET}
        />
      </div>

      {/* ---- Bottom: local machine network info, pinned to the bottom ---- */}
      <div className="mt-auto pt-8">
        <LocalNetworkInfo />
      </div>
    </div>
  );
}
