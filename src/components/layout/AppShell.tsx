import { useMemo } from "react";
import { motion } from "framer-motion";
import { useLocation, Outlet } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { useI18n } from "@/hooks/useI18n";
import { isTauri } from "@/lib/tauri";
import { cn } from "@/lib/utils";
import { Sidebar } from "./Sidebar";

type PageEnterState = {
  enterFadeMs?: number;
};

export function AppShell() {
  const { t } = useI18n();
  const location = useLocation();
  const inTauri = isTauri();
  const isScan = location.pathname === "/scan";
  const isSftp = location.pathname === "/sftp";
  const isSpeedtest = location.pathname === "/speedtest";
  const isConnectivity = location.pathname === "/connectivity";
  const isSettings = location.pathname === "/settings";
  const isFixedLayout =
    isScan || isSftp || isSpeedtest || isConnectivity || isSettings;

  // Freeze enter duration on pathname change so clearing location.state mid-fade
  // cannot retarget / restart the opacity animation (that caused visible flashes).
  const enterDuration = useMemo(() => {
    const ms = (location.state as PageEnterState | null)?.enterFadeMs;
    return ms != null ? ms / 1000 : 0.12;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally pathname-only
  }, [location.pathname]);

  return (
    <div className="flex h-full w-full overflow-hidden">
      <Sidebar />
      <main className={cn("flex min-h-0 flex-1 flex-col", isFixedLayout ? "overflow-hidden" : "overflow-y-auto")}>
        {!inTauri && (
          <div className="flex items-center gap-2 border-b border-destructive/40 bg-destructive/10 px-6 py-2 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{t("appShell.noTauriWarning")}</span>
          </div>
        )}
        {/* Cheap opacity-only page fade. No positional transform / exit gap →
            no "rollback" flicker on navigation, and no per-frame layout work. */}
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: enterDuration, ease: "linear" }}
          className={cn(
            "w-full",
            isFixedLayout && "flex h-full min-h-0 flex-col overflow-hidden px-8",
            (isScan || isSpeedtest || isSftp || isConnectivity) && "py-8",
            isSettings && "pt-6 pb-2",
            !isFixedLayout && "px-8 py-8",
          )}
        >
          <Outlet />
        </motion.div>
      </main>
    </div>
  );
}
