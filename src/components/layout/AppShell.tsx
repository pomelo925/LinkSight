import { AnimatePresence, motion } from "framer-motion";
import { useLocation, Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";

export function AppShell() {
  const location = useLocation();

  return (
    <div className="flex h-full w-full overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="mx-auto max-w-5xl px-8 py-8"
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
