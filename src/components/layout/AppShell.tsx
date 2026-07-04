import { motion } from "framer-motion";
import { useLocation, Outlet } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { isTauri } from "@/lib/tauri";
import { Sidebar } from "./Sidebar";

export function AppShell() {
  const location = useLocation();
  const inTauri = isTauri();

  return (
    <div className="flex h-full w-full overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        {!inTauri && (
          <div className="flex items-center gap-2 border-b border-destructive/40 bg-destructive/10 px-6 py-2 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>
              Running without Tauri backend — network commands will fail. Use{" "}
              <code className="rounded bg-destructive/10 px-1">./run.sh dev</code>{" "}
              then <code className="rounded bg-destructive/10 px-1">./scripts/dev.sh</code>{" "}
              and open the desktop window.
            </span>
          </div>
        )}
        {/* Cheap opacity-only page fade. No positional transform / exit gap →
            no "rollback" flicker on navigation, and no per-frame layout work. */}
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.12, ease: "linear" }}
          className="mx-auto max-w-5xl px-8 py-8"
          style={{ willChange: "opacity" }}
        >
          <Outlet />
        </motion.div>
      </main>
    </div>
  );
}
