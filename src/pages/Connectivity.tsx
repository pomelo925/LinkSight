import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Monitor,
  Server,
  ArrowLeftRight,
  Plus,
  Activity,
  SlidersHorizontal,
} from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { HostCircle } from "@/features/network/HostCircle";
import { HostPicker } from "@/features/network/HostPicker";
import { StatusIndicator } from "@/features/network/StatusIndicator";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useHostStore } from "@/store/useHostStore";
import { useHomeStore } from "@/store/useHomeStore";
import { useConnectivity } from "@/hooks/useConnectivity";
import { useHostSelection } from "@/hooks/useHostSelection";
import { useI18n } from "@/hooks/useI18n";
import { isTauri } from "@/lib/tauri";
import type { ConnectivityPhase, HostRecord } from "@/lib/types";
import {
  ConnectivityMetricsGrid,
  connectivityMetricValues,
} from "@/features/connectivity/ConnectivityMetrics";
import { SettingsDialog } from "@/features/settings/SettingsDialogs";

function hostEndpoint(h: HostRecord): string {
  const port = h.port != null && h.port > 0 ? `:${h.port}` : "";
  return `${h.username}@${h.ip}${port}`;
}

export function Connectivity() {
  const { t } = useI18n();
  const selectedHost = useHomeStore((s) => s.selectedHost);
  const hostsLoad = useHostStore((s) => s.load);
  const { execute, status, progress, result, hostId } = useConnectivity();
  const selectAndVerify = useHostSelection();
  const [showSettings, setShowSettings] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const phaseLabel = (phase: ConnectivityPhase) => {
    switch (phase) {
      case "handshake":
        return t("connectivity.phase.handshake");
      case "ping":
        return t("connectivity.phase.ping");
      case "mtu":
        return t("connectivity.phase.mtu");
      case "traceroute":
        return t("connectivity.phase.traceroute");
      case "uplink":
        return t("connectivity.phase.uplink");
      case "downlink":
        return t("connectivity.phase.downlink");
      case "done":
        return t("connectivity.phase.done");
    }
  };

  useEffect(() => {
    if (isTauri()) hostsLoad().catch(() => undefined);
  }, [hostsLoad]);

  const pickHost = (host: HostRecord) => {
    setPickerOpen(false);
    void selectAndVerify(host);
  };

  const running = status === "running" || status === "analyzing";
  const resultForHost = result && hostId === selectedHost?.id ? result : null;
  const failed = !running && resultForHost?.status === "failed";
  const values = connectivityMetricValues(running ? progress : null, running ? null : resultForHost);

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col">
      <PageHeader title={t("connectivity.title")} description={t("connectivity.description")} />

      {/* ---- Top: the two peer circles (kept identical to Home) ---- */}
      <Card>
        <CardContent className="py-8">
          <div className="flex flex-col items-center justify-center gap-8 lg:flex-row lg:gap-12">
            <HostCircle icon={Monitor} title="127.0.0.1" subtitle={t("common.thisMachine")} />
            <div className="hidden items-center text-muted-foreground lg:flex">
              <ArrowLeftRight className="h-6 w-6" />
            </div>
            <div className="relative">
              {selectedHost ? (
                <HostCircle
                  icon={Server}
                  title={selectedHost.alias}
                  subtitle={hostEndpoint(selectedHost)}
                  onClick={() => setPickerOpen((v) => !v)}
                />
              ) : (
                <HostCircle
                  icon={Plus}
                  title={t("common.selectHost")}
                  subtitle={t("common.chooseRemotePeer")}
                  dashed
                  onClick={() => setPickerOpen((v) => !v)}
                />
              )}
              {pickerOpen && (
                <HostPicker onPick={pickHost} onClose={() => setPickerOpen(false)} />
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ---- Below: live analysis and final metrics ---- */}
      <div className="mt-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold text-muted-foreground">
              {t("connectivity.analysis.title")}
            </h2>
            {running && progress && (
              <span className="text-xs text-muted-foreground">
                {phaseLabel(progress.phase)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <StatusIndicator status={status} />
            <Button
              size="sm"
              variant="ghost"
              aria-label={t("connectivity.actions.testSettings")}
              onClick={() => setShowSettings(true)}
            >
              <SlidersHorizontal className="h-4 w-4" />
              {t("common.settings")}
            </Button>
            {selectedHost && (
              <Button
                size="sm"
                disabled={running || !isTauri()}
                onClick={() => execute(selectedHost)}
              >
                <Activity className="h-4 w-4" />
                {resultForHost ? t("connectivity.actions.runAgain") : t("connectivity.actions.runTest")}
              </Button>
            )}
          </div>
        </div>

        {!selectedHost ? (
          <Card>
            <CardContent className="space-y-3 py-10 text-center text-sm text-muted-foreground">
              <p>{t("connectivity.empty.noHost")}</p>
              <Button asChild size="sm" variant="secondary">
                <Link to="/hosts">{t("connectivity.actions.manageHosts")}</Link>
              </Button>
            </CardContent>
          </Card>
        ) : failed ? (
          <Card>
            <CardContent className="py-6">
              <p className="text-sm text-destructive">
                {resultForHost?.error ?? t("connectivity.failed")}
              </p>
            </CardContent>
          </Card>
        ) : running || resultForHost ? (
          <>
            <ConnectivityMetricsGrid
              values={values}
              activePhase={running ? progress?.phase : null}
              phaseProgress={progress?.progress}
            />
            {!running && resultForHost?.raw && (
              <Card>
                <CardContent className="py-4">
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {t("connectivity.notes.title")}
                  </p>
                  <pre className="whitespace-pre-wrap text-xs text-muted-foreground">
                    {resultForHost.raw}
                  </pre>
                </CardContent>
              </Card>
            )}
          </>
        ) : (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              {t("connectivity.ready", { alias: selectedHost.alias })}
            </CardContent>
          </Card>
        )}
      </div>

      <SettingsDialog
        open={showSettings}
        onClose={() => setShowSettings(false)}
        defaultTab="p2p"
      />
    </div>
  );
}
