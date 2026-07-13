import { memo, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
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
import { cn, formatMs } from "@/lib/utils";
import type { HostRecord, InterfaceInfo } from "@/lib/types";

/** Single-host Internet Test exit choreography. */
type InternetExitPhase = "idle" | "centering" | "exiting";

/** P2P Connectivity Test exit choreography. */
type P2pExitPhase = "idle" | "focusing" | "exiting";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Smooth ease-in-out — slow start/end so motion doesn't feel like a jump. */
const easeSmooth = [0.45, 0.05, 0.25, 1] as const;

/** Speed multiplier: higher = faster (1.3x requested). */
const SPEED = 1.3;
const ms = (n: number) => Math.round(n / SPEED);

const INTERNET = {
  peerFadeMs: ms(450),
  moveMs: ms(900),
  holdMs: ms(180),
  exitMs: ms(560),
  enterMs: ms(280),
  /** One ripple ring expand+fade. */
  rippleMs: ms(1100),
  /** Delay between successive rings. */
  rippleStaggerMs: ms(280),
} as const;

const P2P = {
  chromeMs: ms(320),
  scaleMs: ms(750),
  connectorMs: ms(320),
  focusMs: ms(2800),
  exitMs: ms(560),
  enterMs: ms(280),
  /** Time each dot stays lit before advancing left→right. */
  dotStepMs: ms(320),
  /** Fade between lit/dim for a single dot. */
  dotTweenMs: ms(180),
} as const;

/**
 * Explicit sequential pulse: only one dot is bright+scaled at a time,
 * sweeping left → right, then repeating.
 */
function ConnectingDots({ active }: { active: boolean }) {
  // -1 = all dim (brief beat between sweeps)
  const [litIndex, setLitIndex] = useState(0);

  useEffect(() => {
    if (!active) {
      setLitIndex(0);
      return;
    }
    setLitIndex(0);
    const id = window.setInterval(() => {
      setLitIndex((prev) => {
        // 0 → 1 → 2 → -1 (pause) → 0 …
        if (prev === 2) return -1;
        if (prev === -1) return 0;
        return prev + 1;
      });
    }, P2P.dotStepMs);
    return () => window.clearInterval(id);
  }, [active]);

  return (
    <div className="flex items-center gap-2.5 px-1" aria-hidden>
      {[0, 1, 2].map((i) => {
        const lit = active && litIndex === i;
        return (
          <motion.span
            key={i}
            className="block h-2.5 w-2.5 rounded-full bg-primary"
            initial={false}
            animate={{
              opacity: lit ? 1 : 0.22,
              scale: lit ? 1.55 : 1,
            }}
            transition={{
              duration: P2P.dotTweenMs / 1000,
              ease: "easeInOut",
            }}
          />
        );
      })}
    </div>
  );
}

/**
 * Soft water-ripple rings expanding from a host circle’s edge.
 * Shown after the single-host Internet Test circle reaches center.
 */
function HostRipples({ active }: { active: boolean }) {
  return (
    <AnimatePresence>
      {active ? (
        <div
          key="ripples"
          className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center"
          aria-hidden
        >
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="absolute inset-0 rounded-full border-2 border-primary/45"
              initial={{ scale: 1, opacity: 0 }}
              animate={{
                scale: [1, 1.72],
                opacity: [0.55, 0],
              }}
              exit={{ opacity: 0 }}
              transition={{
                duration: INTERNET.rippleMs / 1000,
                ease: "easeOut",
                delay: (i * INTERNET.rippleStaggerMs) / 1000,
                repeat: Infinity,
                repeatDelay: 0.12,
              }}
            />
          ))}
        </div>
      ) : null}
    </AnimatePresence>
  );
}

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
  const [internetExit, setInternetExit] = useState<InternetExitPhase>("idle");
  const [p2pExit, setP2pExit] = useState<P2pExitPhase>("idle");
  const [localSlide, setLocalSlide] = useState({ x: 0, y: 0 });
  const [internetRipples, setInternetRipples] = useState(false);

  const peersRowRef = useRef<HTMLDivElement>(null);
  const localHostRef = useRef<HTMLDivElement>(null);

  const internetBusy = internetExit !== "idle";
  const p2pBusy = p2pExit !== "idle";
  const transitioning = internetBusy || p2pBusy;
  const p2pFocusing = p2pExit === "focusing" || p2pExit === "exiting";

  useEffect(() => {
    if (isTauri()) hostsLoad().catch(() => undefined);
  }, [hostsLoad]);

  const startConnectivity = () => {
    if (!selectedHost || transitioning) return;
    void (async () => {
      setP2pExit("focusing");
      void runConnectivity(selectedHost);
      // Start page fade 0.5s earlier while dots keep pulsing through exit.
      await sleep(Math.max(0, P2P.focusMs - 500));
      setP2pExit("exiting");
      await sleep(P2P.exitMs);
      navigate("/connectivity", { state: { enterFadeMs: P2P.enterMs } });
    })();
  };

  const startSftp = () => {
    if (!selectedHost || transitioning) return;
    navigate("/sftp");
  };

  const pickHost = (host: HostRecord) => {
    setPickerOpen(false);
    void selectAndVerify(host);
  };

  /** Single-host: fade peers in place, slide+scale local to row center, then fade out. */
  const startInternetTest = () => {
    if (transitioning || selectedHost) return;
    setPickerOpen(false);
    setInternetRipples(false);

    const row = peersRowRef.current;
    const local = localHostRef.current;
    if (row && local) {
      const rowBox = row.getBoundingClientRect();
      const localBox = local.getBoundingClientRect();
      setLocalSlide({
        x: rowBox.left + rowBox.width / 2 - (localBox.left + localBox.width / 2),
        y: rowBox.top + rowBox.height / 2 - (localBox.top + localBox.height / 2),
      });
    } else {
      setLocalSlide({ x: 0, y: 0 });
    }

    setInternetExit("centering");
    void (async () => {
      await sleep(INTERNET.moveMs);
      setInternetRipples(true);
      await sleep(INTERNET.holdMs);
      setInternetExit("exiting");
      await sleep(INTERNET.exitMs);
      navigate("/speedtest", {
        state: { autoRun: true, enterFadeMs: INTERNET.enterMs },
      });
    })();
  };

  const hostScaleTransition = {
    duration: (p2pFocusing ? P2P.scaleMs : INTERNET.moveMs) / 1000,
    ease: easeSmooth,
  };

  return (
    <motion.div
      className="flex min-h-[calc(100vh-4rem)] flex-col"
      aria-busy={transitioning || undefined}
      animate={{
        opacity: internetExit === "exiting" || p2pExit === "exiting" ? 0 : 1,
      }}
      transition={{
        duration:
          (internetExit === "exiting" ? INTERNET.exitMs : P2P.exitMs) / 1000,
        ease: "easeInOut",
      }}
    >
      <motion.div
        className="shrink-0"
        animate={{ opacity: transitioning ? 0 : 1 }}
        transition={{
          duration: (p2pBusy ? P2P.chromeMs : INTERNET.peerFadeMs) / 1000,
          ease: "easeInOut",
        }}
      >
        <PageHeader title={t("home.title")} description={t("home.description")} />
      </motion.div>

      {/* Immersive center: large peer circles + actions, no enclosing card */}
      <div className="flex flex-1 flex-col items-center justify-center gap-10 px-4 py-8">
        <div
          ref={peersRowRef}
          className="flex flex-col items-center gap-10 lg:flex-row lg:gap-16 xl:gap-20"
        >
          <motion.div
            ref={localHostRef}
            className="relative"
            animate={{
              x: internetBusy ? localSlide.x : 0,
              y: internetBusy ? localSlide.y : 0,
              scale:
                internetExit === "idle" && !p2pFocusing
                  ? 1
                  : internetBusy
                    ? 1.2
                    : 1.15,
            }}
            transition={{
              x: { duration: INTERNET.moveMs / 1000, ease: easeSmooth },
              y: { duration: INTERNET.moveMs / 1000, ease: easeSmooth },
              scale: hostScaleTransition,
            }}
          >
            <HostRipples active={internetRipples} />
            <div className="relative z-10">
              <HostCircle
                size="lg"
                icon={Monitor}
                title="127.0.0.1"
                subtitle={t("common.thisMachine")}
              />
            </div>
          </motion.div>

          {selectedHost ? (
            <>
              <div
                className={cn(
                  "items-center text-muted-foreground/70",
                  p2pFocusing ? "flex min-h-8" : "hidden lg:flex",
                )}
              >
                <AnimatePresence mode="wait" initial={false}>
                  {p2pFocusing ? (
                    <motion.div
                      key="p2p-dots"
                      initial={{ opacity: 0, scale: 0.88 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.94 }}
                      transition={{
                        duration: P2P.connectorMs / 1000,
                        ease: easeSmooth,
                      }}
                    >
                      <ConnectingDots active={p2pFocusing} />
                    </motion.div>
                  ) : (
                    <motion.div
                      key="p2p-arrow"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      transition={{
                        duration: P2P.connectorMs / 1000,
                        ease: "easeInOut",
                      }}
                    >
                      <ArrowLeftRight className="h-8 w-8" />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              <motion.div
                animate={{ scale: p2pFocusing ? 1.15 : 1 }}
                transition={hostScaleTransition}
              >
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
              </motion.div>
            </>
          ) : (
            <motion.div
              className="flex flex-col items-center gap-10 lg:flex-row lg:gap-16 xl:gap-20"
              animate={{
                opacity: internetBusy ? 0 : 1,
                scale: internetBusy ? 0.94 : 1,
              }}
              transition={{
                duration: INTERNET.peerFadeMs / 1000,
                ease: "easeInOut",
              }}
              style={{
                pointerEvents: internetBusy ? "none" : undefined,
              }}
            >
              <div className="hidden items-center text-muted-foreground/70 lg:flex">
                <ArrowLeftRight className="h-8 w-8" />
              </div>
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
            </motion.div>
          )}
        </div>

        {selectedHost ? (
          <AnimatePresence initial={false}>
            {!p2pBusy && (
              <motion.div
                key="p2p-actions"
                className="flex flex-col items-center gap-4"
                initial={false}
                exit={{ opacity: 0, y: 12 }}
                transition={{ duration: P2P.chromeMs / 1000, ease: "easeInOut" }}
              >
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
              </motion.div>
            )}
          </AnimatePresence>
        ) : (
          <motion.div
            animate={{ opacity: internetBusy ? 0 : 1, y: internetBusy ? 8 : 0 }}
            transition={{
              duration: INTERNET.peerFadeMs / 1000,
              ease: "easeInOut",
            }}
            className={internetBusy ? "pointer-events-none" : undefined}
          >
            <Button
              size="lg"
              className="h-12 px-8 text-base"
              disabled={internetBusy}
              onClick={startInternetTest}
            >
              <Gauge className="h-5 w-5" />
              {t("home.actions.runInternetTest")}
            </Button>
          </motion.div>
        )}
      </div>

      <motion.div
        className="mt-auto shrink-0 border-t border-border/40 pt-6"
        animate={{ opacity: transitioning ? 0 : 1 }}
        transition={{
          duration: (p2pBusy ? P2P.chromeMs : INTERNET.peerFadeMs) / 1000,
          ease: "easeInOut",
        }}
      >
        <LocalNetworkInfo />
      </motion.div>
    </motion.div>
  );
}
