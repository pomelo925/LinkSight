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
} from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { HostCircle } from "@/features/network/HostCircle";
import { HostPicker } from "@/features/network/HostPicker";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useHostStore } from "@/store/useHostStore";
import { useHomeStore } from "@/store/useHomeStore";
import { useConnectivity } from "@/hooks/useConnectivity";
import { useHostSelection } from "@/hooks/useHostSelection";
import { useI18n } from "@/hooks/useI18n";
import { listNetworkInterfaces } from "@/lib/api";
import { isTauri } from "@/lib/tauri";
import { formatMs } from "@/lib/utils";
import type { HostRecord, InterfaceInfo } from "@/lib/types";

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

  const { execute: runConnectivity } = useConnectivity();
  const selectAndVerify = useHostSelection();

  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    if (isTauri()) hostsLoad().catch(() => undefined);
  }, [hostsLoad]);

  const startConnectivity = () => {
    if (!selectedHost) return;
    void runConnectivity(selectedHost);
    navigate("/connectivity");
  };

  const startSftp = () => {
    if (!selectedHost) return;
    navigate("/sftp");
  };

  const pickHost = (host: HostRecord) => {
    setPickerOpen(false);
    void selectAndVerify(host);
  };

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col">
      <div className="shrink-0">
        <PageHeader title={t("home.title")} description={t("home.description")} />
      </div>

      {/* Immersive center: large peer circles + actions, no enclosing card */}
      <div className="flex flex-1 flex-col items-center justify-center gap-10 px-4 py-8">
        <div className="flex flex-col items-center gap-10 lg:flex-row lg:gap-16 xl:gap-20">
          <HostCircle
            size="lg"
            icon={Monitor}
            title="127.0.0.1"
            subtitle={t("common.thisMachine")}
          />

          <div className="hidden items-center text-muted-foreground/70 lg:flex">
            <ArrowLeftRight className="h-8 w-8" />
          </div>

          {selectedHost ? (
            <HostCircle
              size="lg"
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
                size="lg"
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

        {selectedHost ? (
          <div className="flex flex-col items-center gap-4">
            {verifyStatus === "verifying" && (
              <span className="flex items-center gap-2 text-base text-primary">
                <Loader2 className="h-5 w-5 animate-spin" />
                {t("home.verify.verifying")}
              </span>
            )}
            {verifyStatus === "ok" && (
              <span className="flex items-center gap-2 text-base text-success">
                <CheckCircle2 className="h-5 w-5" />
                {t("home.verify.verified")}
                {verifyResult?.latencyMs != null &&
                  ` · ${formatMs(verifyResult.latencyMs)}`}
              </span>
            )}
            {verifyStatus === "failed" && (
              <span
                className="flex max-w-md items-center gap-2 text-center text-base text-destructive"
                title={verifyResult?.message ?? undefined}
              >
                <XCircle className="h-5 w-5 shrink-0" />
                {verifyResult?.message ?? t("home.verify.failed")}
              </span>
            )}
            <div className="flex flex-wrap justify-center gap-3">
              <Button
                size="lg"
                className="h-12 px-6"
                disabled={verifyStatus !== "ok"}
                onClick={startConnectivity}
              >
                <ArrowLeftRight className="h-5 w-5" />
                {t("home.actions.connectivityTest")}
              </Button>
              <Button
                size="lg"
                variant="secondary"
                className="h-12 px-6"
                disabled={verifyStatus !== "ok"}
                onClick={startSftp}
              >
                <FolderTree className="h-5 w-5" />
                {t("nav.sftp")}
              </Button>
              <Button
                size="lg"
                variant="ghost"
                className="h-12 px-6"
                onClick={() => selectHost(null)}
              >
                {t("common.change")}
              </Button>
            </div>
          </div>
        ) : (
          <Button
            size="lg"
            className="h-12 px-8 text-base"
            onClick={() => navigate("/speedtest", { state: { autoRun: true } })}
          >
            <Gauge className="h-5 w-5" />
            {t("home.actions.runInternetTest")}
          </Button>
        )}
      </div>

      <div className="mt-auto shrink-0 border-t border-border/40 pt-6">
        <LocalNetworkInfo />
      </div>
    </div>
  );
}
