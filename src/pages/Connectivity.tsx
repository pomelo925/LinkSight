import { PageHeader } from "@/components/layout/PageHeader";
import { HostCircle } from "@/features/network/HostCircle";
import { HostPicker } from "@/features/network/HostPicker";
import { StatusIndicator } from "@/features/network/StatusIndicator";
import { TestRunStopButton } from "@/features/network/TestRunStopButton";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useHostStore } from "@/store/useHostStore";
import { useHomeStore } from "@/store/useHomeStore";
import { useConnectivity } from "@/hooks/useConnectivity";
import { useHostSelection } from "@/hooks/useHostSelection";
import { useI18n } from "@/hooks/useI18n";
import { isTauri } from "@/lib/tauri";
import { cn, formatMs } from "@/lib/utils";
import type { ConnectivityPhase, HostRecord } from "@/lib/types";
import {
  ConnectivityMetricsGrid,
  connectivityMetricValues,
} from "@/features/connectivity/ConnectivityMetrics";
import { SettingsDialog } from "@/features/settings/SettingsDialogs";
import {
  Monitor,
  Server,
  ArrowLeftRight,
  Plus,
  Activity,
  SlidersHorizontal,
  Loader2,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

function hostEndpoint(h: HostRecord): string {
  const port = h.port != null && h.port > 0 ? `:${h.port}` : "";
  return `${h.username}@${h.ip}${port}`;
}

export function Connectivity() {
  const { t } = useI18n();
  const selectedHost = useHomeStore((s) => s.selectedHost);
  const verifyStatus = useHomeStore((s) => s.verifyStatus);
  const verifyResult = useHomeStore((s) => s.verifyResult);
  const hostsLoad = useHostStore((s) => s.load);
  const { execute, cancel, status, progress, result, hostId } = useConnectivity();
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

  // Host already selected (e.g. navigated here) but not yet verified — match Home.
  useEffect(() => {
    if (!selectedHost || verifyStatus !== "idle" || !isTauri()) return;
    void selectAndVerify(selectedHost);
  }, [selectedHost, verifyStatus, selectAndVerify]);

  const pickHost = (host: HostRecord) => {
    setPickerOpen(false);
    void selectAndVerify(host);
  };

  const running = status === "running" || status === "analyzing";
  const verified = verifyStatus === "ok";
  const resultForHost = result && hostId === selectedHost?.id ? result : null;
  const failed = !running && resultForHost?.status === "failed";
  const values = connectivityMetricValues(running ? progress : null, running ? null : resultForHost);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="shrink-0">
        <PageHeader title={t("connectivity.title")} description={t("connectivity.description")} />
      </div>

      {/* ---- Top: compact peer row; run control top-left, status top-right ---- */}
      <Card className="shrink-0">
        <CardContent className="relative px-4 py-5 sm:px-6">
          {selectedHost && (
            <div className="absolute left-4 top-4 z-10 flex flex-col items-start gap-2 sm:left-5 sm:top-5">
              <TestRunStopButton
                running={running}
                runIcon={Activity}
                runLabel={
                  resultForHost
                    ? t("connectivity.actions.runAgain")
                    : t("connectivity.actions.runTest")
                }
                stopLabel={t("common.stop")}
                disabled={!isTauri() || !verified}
                onRun={() => void execute(selectedHost)}
                onStop={() => void cancel()}
                minWidthClass="min-w-[12.5rem]"
              />
              {verifyStatus === "verifying" && (
                <span className="flex items-center gap-1.5 text-xs text-primary">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {t("home.verify.verifying")}
                </span>
              )}
              {verifyStatus === "ok" && (
                <span className="flex items-center gap-1.5 text-xs text-success">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {t("home.verify.verified")}
                  {verifyResult?.latencyMs != null &&
                    ` · ${formatMs(verifyResult.latencyMs)}`}
                </span>
              )}
              {verifyStatus === "failed" && (
                <span
                  className="flex max-w-[14rem] items-start gap-1.5 text-xs text-destructive"
                  title={verifyResult?.message ?? undefined}
                >
                  <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span className="line-clamp-2">
                    {verifyResult?.message ?? t("home.verify.failed")}
                  </span>
                </span>
              )}
            </div>
          )}

          <div className="absolute right-4 top-4 z-10 sm:right-5 sm:top-5">
            <StatusIndicator status={status} />
          </div>

          <div
            className={cn(
              "flex flex-col items-center justify-center gap-6 lg:flex-row lg:gap-10",
              selectedHost && "pt-14 lg:pt-2",
            )}
          >
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

      {/* ---- Analysis: only this region scrolls when space is tight ---- */}
      <div className="mt-4 flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex shrink-0 items-center gap-3 pb-3">
          <h2 className="text-sm font-semibold text-muted-foreground">
            {t("connectivity.analysis.title")}
          </h2>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 px-2"
            aria-label={t("connectivity.actions.testSettings")}
            onClick={() => setShowSettings(true)}
          >
            <SlidersHorizontal className="h-4 w-4" />
            {t("common.settings")}
          </Button>
          {running && progress && (
            <span className="text-xs text-muted-foreground">
              {phaseLabel(progress.phase)}
            </span>
          )}
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
          {!selectedHost ? (
            <Card>
              <CardContent className="space-y-3 py-10 text-center text-sm text-muted-foreground">
                <p>{t("connectivity.empty.noHost")}</p>
                <Button asChild size="sm" variant="secondary">
                  <Link to="/hosts">{t("connectivity.actions.manageHosts")}</Link>
                </Button>
              </CardContent>
            </Card>
          ) : verifyStatus === "verifying" ? (
            <Card>
              <CardContent className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                {t("home.verify.verifying")}
              </CardContent>
            </Card>
          ) : verifyStatus === "failed" ? (
            <Card>
              <CardContent className="py-6">
                <p className="text-sm text-destructive">
                  {verifyResult?.message ?? t("home.verify.failed")}
                </p>
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
      </div>

      <SettingsDialog
        open={showSettings}
        onClose={() => setShowSettings(false)}
        defaultTab="p2p"
      />
    </div>
  );
}
