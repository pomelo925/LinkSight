import { NavLink, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import {
  Home,
  Server,
  Radar,
  FolderTree,
  Network,
  Zap,
  Settings,
  ChevronRight,
  Container,
  Cpu,
  type LucideIcon,
} from "lucide-react";
import appIcon from "@/assets/app-icon.png";
import { cn } from "@/lib/utils";
import { htmlLang } from "@/lib/i18n";
import { HOVER_POP_GROUP } from "@/lib/interactive";
import { FONT_SIZE_CLASS, type FontSize } from "@/lib/fontSize";
import { ALL_THEME_IDS, THEME_CLASS } from "@/lib/theme";
import { useI18n } from "@/hooks/useI18n";
import { useFontSizeStore } from "@/store/useFontSizeStore";
import { useThemeStore } from "@/store/useThemeStore";
import { useSettingsPreviewStore } from "@/store/useSettingsPreviewStore";

type NavLeaf = {
  to: string;
  labelKey: string;
  icon: LucideIcon;
  end?: boolean;
};

type NavGroup = {
  id: "network" | "system";
  labelKey: string;
  icon: LucideIcon;
  children: NavLeaf[];
};

const HOME_ITEM: NavLeaf = {
  to: "/",
  labelKey: "nav.home",
  icon: Home,
  end: true,
};

const NETWORK_GROUP: NavGroup = {
  id: "network",
  labelKey: "nav.group.network",
  icon: Network,
  children: [
    { to: "/hosts", labelKey: "nav.hosts", icon: Server },
    { to: "/scan", labelKey: "nav.scan", icon: Radar },
    { to: "/speedtest", labelKey: "nav.speedtest", icon: Zap },
    { to: "/connectivity", labelKey: "nav.connectivity", icon: Network },
    { to: "/sftp", labelKey: "nav.sftp", icon: FolderTree },
  ],
};

const SYSTEM_GROUP: NavGroup = {
  id: "system",
  labelKey: "nav.group.system",
  icon: Cpu,
  children: [{ to: "/docker", labelKey: "nav.docker", icon: Container }],
};

const SETTINGS_ITEM: NavLeaf = {
  to: "/settings",
  labelKey: "nav.settings",
  icon: Settings,
};

const NAV_STORAGE_KEY = "linksight-nav-expanded";

type ExpandedState = Record<NavGroup["id"], boolean>;

const DEFAULT_EXPANDED: ExpandedState = {
  network: true,
  system: true,
};

function loadExpanded(): ExpandedState {
  try {
    const raw = localStorage.getItem(NAV_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_EXPANDED };
    const parsed = JSON.parse(raw) as Partial<ExpandedState>;
    return {
      network: parsed.network ?? DEFAULT_EXPANDED.network,
      system: parsed.system ?? DEFAULT_EXPANDED.system,
    };
  } catch {
    return { ...DEFAULT_EXPANDED };
  }
}

function pathInGroup(pathname: string, group: NavGroup): boolean {
  return group.children.some((child) =>
    child.end ? pathname === child.to : pathname === child.to || pathname.startsWith(`${child.to}/`),
  );
}

function NavItemLink({ item }: { item: NavLeaf }) {
  const { t } = useI18n();
  return (
    <NavLink to={item.to} end={item.end}>
      {({ isActive }) => (
        <div
          className={cn(
            "group relative flex min-w-0 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
            isActive
              ? "text-primary-foreground"
              : "text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
        >
          {isActive && (
            <motion.div
              layoutId="sidebar-active"
              className="absolute inset-0 rounded-lg bg-primary"
              transition={{ duration: 0.18, ease: "easeOut" }}
              style={{ willChange: "transform" }}
            />
          )}
          <span className={cn("relative z-10 inline-flex min-w-0 items-center gap-3", HOVER_POP_GROUP)}>
            <item.icon className="h-4 w-4 shrink-0" />
            <span className="min-w-0 truncate">{t(item.labelKey)}</span>
          </span>
        </div>
      )}
    </NavLink>
  );
}

function NavGroupSection({
  group,
  expanded,
  onToggle,
}: {
  group: NavGroup;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { t } = useI18n();
  const location = useLocation();
  const childActive = pathInGroup(location.pathname, group);

  return (
    <div className="flex flex-col gap-0.5">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className={cn(
          "group flex w-full min-w-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
          "text-muted-foreground hover:bg-accent hover:text-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          childActive && !expanded && "text-foreground",
        )}
      >
        <span className={cn("inline-flex min-w-0 flex-1 items-center gap-2", HOVER_POP_GROUP)}>
          <group.icon className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate text-left">{t(group.labelKey)}</span>
          <ChevronRight
            className={cn(
              "h-3.5 w-3.5 shrink-0 transition-transform duration-200",
              expanded && "rotate-90",
            )}
          />
        </span>
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key={group.id}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="ml-2 flex flex-col gap-0.5 border-l border-border/60 pl-2">
              {group.children.map((child) => (
                <NavItemLink key={child.to} item={child} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function Sidebar() {
  const location = useLocation();
  const [expanded, setExpanded] = useState<ExpandedState>(loadExpanded);

  // Keep the active section open while navigating within it.
  useEffect(() => {
    setExpanded((prev) => {
      let next = prev;
      for (const group of [NETWORK_GROUP, SYSTEM_GROUP]) {
        if (pathInGroup(location.pathname, group) && !prev[group.id]) {
          if (next === prev) next = { ...prev };
          next[group.id] = true;
        }
      }
      return next;
    });
  }, [location.pathname]);

  useEffect(() => {
    localStorage.setItem(NAV_STORAGE_KEY, JSON.stringify(expanded));
  }, [expanded]);

  const toggle = (id: NavGroup["id"]) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-border bg-card">
      <div className="flex items-center gap-2 px-6 py-5">
        <img src={appIcon} alt="" className="h-10 w-10 shrink-0 rounded-lg" aria-hidden />
        <span className="text-lg font-semibold tracking-tight">LinkSight</span>
      </div>

      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3">
        <NavItemLink item={HOME_ITEM} />
        <NavGroupSection
          group={NETWORK_GROUP}
          expanded={expanded.network}
          onToggle={() => toggle("network")}
        />
        <NavGroupSection
          group={SYSTEM_GROUP}
          expanded={expanded.system}
          onToggle={() => toggle("system")}
        />

        <div className="mt-auto pt-3">
          <NavItemLink item={SETTINGS_ITEM} />
        </div>
      </nav>

      <div className="px-6 py-4 text-xs text-muted-foreground">
        v{__APP_VERSION__} · Linux
      </div>
    </aside>
  );
}

/** Syncs the document `lang` attribute when the locale changes. */
export function LanguageSync() {
  const locale = useI18n().locale;

  useEffect(() => {
    document.documentElement.lang = htmlLang(locale);
    document.documentElement.classList.toggle("locale-zh", locale === "zh-TW");
  }, [locale]);

  return null;
}

/** Applies the active (preview or persisted) root font-size scale to `<html>`. */
export function FontSizeSync() {
  const committed = useFontSizeStore((s) => s.fontSize);
  const preview = useSettingsPreviewStore((s) => s.fontSize);
  const fontSize = preview ?? committed;

  useEffect(() => {
    const root = document.documentElement;
    (["sm", "md", "lg"] as FontSize[]).forEach((size) => {
      root.classList.toggle(FONT_SIZE_CLASS[size], size === fontSize);
    });
  }, [fontSize]);

  return null;
}

/** Applies the active (preview or persisted) color palette to `<html>`. */
export function ThemeSync() {
  const committed = useThemeStore((s) => s.theme);
  const preview = useSettingsPreviewStore((s) => s.theme);
  const theme = preview ?? committed;

  useEffect(() => {
    const root = document.documentElement;
    ALL_THEME_IDS.forEach((id) => {
      root.classList.toggle(THEME_CLASS[id], id === theme);
    });
  }, [theme]);

  return null;
}
