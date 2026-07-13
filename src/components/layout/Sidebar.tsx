import { useEffect } from "react";
import { NavLink } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Home,
  Server,
  Radar,
  FolderTree,
  Network,
  Zap,
  Settings,
} from "lucide-react";
import appIcon from "@/assets/app-icon.png";
import { cn } from "@/lib/utils";
import { htmlLang } from "@/lib/i18n";
import { FONT_SIZE_CLASS, type FontSize } from "@/lib/fontSize";
import { ALL_THEME_IDS, THEME_CLASS } from "@/lib/theme";
import { useI18n } from "@/hooks/useI18n";
import { useFontSizeStore } from "@/store/useFontSizeStore";
import { useThemeStore } from "@/store/useThemeStore";
import { useSettingsPreviewStore } from "@/store/useSettingsPreviewStore";

const NAV_ITEMS = [
  { to: "/", labelKey: "nav.home", icon: Home, end: true },
  { to: "/hosts", labelKey: "nav.hosts", icon: Server },
  { to: "/scan", labelKey: "nav.scan", icon: Radar },
  { to: "/speedtest", labelKey: "nav.speedtest", icon: Zap },
  { to: "/connectivity", labelKey: "nav.connectivity", icon: Network },
  { to: "/sftp", labelKey: "nav.sftp", icon: FolderTree },
  { to: "/settings", labelKey: "nav.settings", icon: Settings },
] as const;

export function Sidebar() {
  const { t } = useI18n();

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-border bg-card">
      <div className="flex items-center gap-2 px-6 py-5">
        <img src={appIcon} alt="" className="h-10 w-10 shrink-0 rounded-lg" aria-hidden />
        <span className="text-lg font-semibold tracking-tight">LinkSight</span>
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-3">
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.to} to={item.to} end={"end" in item ? item.end : undefined}>
            {({ isActive }) => (
              <div
                className={cn(
                  "relative flex min-w-0 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
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
                <item.icon className="relative z-10 h-4 w-4 shrink-0" />
                <span className="relative z-10 min-w-0 truncate">{t(item.labelKey)}</span>
              </div>
            )}
          </NavLink>
        ))}
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
