import { memo, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Monitor,
  Server,
  Plus,
  Gauge,
  Loader2,
  CheckCircle2,
  XCircle,
  ArrowLeftRight,
  FolderTree,
  Wifi,
  Cable,
  Home as HomeIcon,
} from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { HostCircle } from "@/features/network/HostCircle";
import { HostPicker } from "@/features/network/HostPicker";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useHostStore } from "@/store/useHostStore";
import { useHomeStore } from "@/store/useHomeStore";
import { useSpeedtest } from "@/hooks/useSpeedtest";
import { useConnectivity } from "@/hooks/useConnectivity";
import { useHostSelection } from "@/hooks/useHostSelection";
import { useI18n } from "@/hooks/useI18n";
import { useTraceroute } from "@/hooks/useTraceroute";
import { useTracerouteStore } from "@/store/useTracerouteStore";
import { listNetworkInterfaces } from "@/lib/api";
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

const LocalNetworkInfo = memo(function LocalNetworkInfo() {
  const { t } = useI18n();
  const [interfaces, setInterfaces] = useState<InterfaceInfo[]>([]);
  const [error, setError] = useState<string | null>(null);

  const kindLabel = (kind: InterfaceInfo["kind"]) => {
    switch (kind) {
      case "wifi":
        return t("home.network.kind.wifi");
      case "ethernet":
        return t("home.network.kind.ethernet");
      case "loopback":
        return t("home.network.kind.loopback");
      case "virtual":
        return t("home.network.kind.virtual");
    }
  };

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
        {t("home.network.title")}
      </h2>
      {error ? (
        <Card>
          <CardContent className="py-4 text-sm text-destructive">{error}</CardContent>
        </Card>
      ) : interfaces.length === 0 ? (
        <Card>
          <CardContent className="py-6 text-center text-sm text-muted-foreground">
            {t("home.network.empty")}
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
                      {kindLabel(iface.kind)}
                      <span className="ml-2 text-xs text-muted-foreground">
                        {iface.name}
                      </span>
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {t("home.network.ipLabel")} {iface.ipv4 ?? t("common.emptyValue")} ·{" "}
                      {t("home.network.macLabel")} {iface.mac ?? t("common.emptyValue")}
                    </p>
                  </div>
                </div>
                <Badge variant={iface.isUp ? "success" : "secondary"}>
                  {iface.isUp ? t("home.network.status.up") : t("home.network.status.down")}
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
  const { t } = useI18n();
  const navigate = useNavigate();
  const hostsLoad = useHostStore((s) => s.load);

  const selectedHost = useHomeStore((s) => s.selectedHost);
  const verifyStatus = useHomeStore((s) => s.verifyStatus);
  const verifyResult = useHomeStore((s) => s.verifyResult);
  const selectHost = useHomeStore((s) => s.selectHost);

  const { execute, status, progress, result } = useSpeedtest();
  const testing = status === "running" || status === "analyzing";

  const { execute: runConnectivity } = useConnectivity();
  const selectAndVerify = useHostSelection();

  const startConnectivity = () => {
    if (!selectedHost) return;
    void runConnectivity(selectedHost);
    navigate("/connectivity");
  };

  const startSftp = () => {
    if (!selectedHost) return;
    navigate("/sftp");
  };

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

  const pickHost = (host: HostRecord) => {
    setPickerOpen(false);
    // Quick verification starts automatically after selection.
    void selectAndVerify(host);
  };

  const speedFailed = !testing && result?.status === "failed";

  return (
    // Full-height column so the Local Network section can pin to the bottom.
    <div className="flex min-h-[calc(100vh-4rem)] flex-col">
      <PageHeader
        title={t("home.title")}
        description={t("home.description")}
      />

      {/* ---- Top: the two circles / internet-test panel (fixed height) ---- */}
      <Card>
        <CardContent className="py-8">
          {speedtestView ? (
            <div className="flex min-h-[21rem] flex-col items-center justify-center gap-8 lg:flex-row lg:gap-12">
              {/* Left: always the local machine */}
              <HostCircle icon={Monitor} title="127.0.0.1" subtitle={t("common.thisMachine")} />

              {/* Connector */}
              <div className="hidden items-center text-muted-foreground lg:flex">
                <ArrowLeftRight className="h-6 w-6" />
              </div>

              <div className="w-full max-w-md space-y-4">
                {speedFailed ? (
                  <Card>
                    <CardContent className="py-6">
                      <p className="text-sm text-destructive">
                        {result?.error ?? t("home.speedtest.failed")}
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
                  className={cn("w-full", (testing || !result) && "invisible")}
                  onClick={() => setSpeedtestView(false)}
                >
                  <HomeIcon className="h-4 w-4" />
                  {t("home.actions.backToHome")}
                </Button>
              </div>
            </div>
          ) : (
            // Circles stay in one aligned row (equal height); all contextual
            // status and actions live in a centered zone below both circles.
            <div className="flex min-h-[21rem] flex-col items-center justify-center gap-6">
              <div className="flex flex-col items-center gap-8 lg:flex-row lg:gap-12">
                {/* Left: always the local machine */}
                <HostCircle icon={Monitor} title="127.0.0.1" subtitle={t("common.thisMachine")} />

                {/* Connector */}
                <div className="hidden items-center text-muted-foreground lg:flex">
                  <ArrowLeftRight className="h-6 w-6" />
                </div>

                {/* Right: selected peer or host selector */}
                {selectedHost ? (
                  <HostCircle
                    icon={Server}
                    title={selectedHost.alias}
                    subtitle={`${selectedHost.username}@${selectedHost.ip}${
                      selectedHost.port != null && selectedHost.port > 0
                        ? `:${selectedHost.port}`
                        : ""
                    }`}
                  />
                ) : (
                  <div className="relative">
                    <HostCircle
                      icon={Plus}
                      title={t("common.selectHost")}
                      subtitle={t("common.chooseRemotePeer")}
                      dashed
                      onClick={() => setPickerOpen((v) => !v)}
                    />
                    {pickerOpen && (
                      <HostPicker onPick={pickHost} onClose={() => setPickerOpen(false)} />
                    )}
                  </div>
                )}
              </div>

              {/* Centered action / status zone, below both circles */}
              {selectedHost ? (
                <div className="flex flex-col items-center gap-2">
                  {verifyStatus === "verifying" && (
                    <span className="flex items-center gap-2 text-sm text-primary">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {t("home.verify.verifying")}
                    </span>
                  )}
                  {verifyStatus === "ok" && (
                    <span className="flex items-center gap-2 text-sm text-success">
                      <CheckCircle2 className="h-4 w-4" />
                      {t("home.verify.verified")}
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
                      {verifyResult?.message ?? t("home.verify.failed")}
                    </span>
                  )}
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={verifyStatus !== "ok"}
                      onClick={startConnectivity}
                    >
                      <ArrowLeftRight className="h-4 w-4" />
                      {t("home.actions.connectivityTest")}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={verifyStatus !== "ok"}
                      onClick={startSftp}
                    >
                      <FolderTree className="h-4 w-4" />
                      {t("nav.sftp")}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => selectHost(null)}>
                      {t("common.change")}
                    </Button>
                  </div>
                </div>
              ) : (
                <Button size="sm" onClick={startSpeedtest}>
                  <Gauge className="h-4 w-4" />
                  {t("home.actions.runInternetTest")}
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ---- Middle: route trace (fishbone). Hidden once a target host is
           selected, since the route view only applies to the internet test. ---- */}
      {!selectedHost && (
        <div className="mt-6">
          <TracerouteFishbone
            result={speedtestView ? traceResult : null}
            running={speedtestView && tracing}
            target={TEST_TARGET}
          />
        </div>
      )}

      {/* ---- Bottom: local machine network info, pinned to the bottom ---- */}
      <div className="mt-auto pt-8">
        <LocalNetworkInfo />
      </div>
    </div>
  );
}
