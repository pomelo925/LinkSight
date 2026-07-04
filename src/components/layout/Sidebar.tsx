import { NavLink } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Activity,
  LayoutDashboard,
  Radar,
  TerminalSquare,
  Gauge,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/network", label: "Network Test", icon: Activity },
  { to: "/scan", label: "LAN Scan", icon: Radar },
  { to: "/bandwidth", label: "Bandwidth", icon: Gauge },
  { to: "/terminal", label: "Terminal", icon: TerminalSquare },
  { to: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-border bg-card/50 backdrop-blur">
      <div className="flex items-center gap-2 px-6 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Activity className="h-5 w-5" />
        </div>
        <span className="text-lg font-semibold tracking-tight">LinkSight</span>
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-3">
        {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end}>
            {({ isActive }) => (
              <div
                className={cn(
                  "relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                {isActive && (
                  <motion.div
                    layoutId="sidebar-active"
                    className="absolute inset-0 rounded-lg bg-primary"
                    transition={{ type: "spring", stiffness: 400, damping: 32 }}
                  />
                )}
                <Icon className="relative z-10 h-4 w-4" />
                <span className="relative z-10">{label}</span>
              </div>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="px-6 py-4 text-xs text-muted-foreground">
        v0.1.0 · Linux
      </div>
    </aside>
  );
}
