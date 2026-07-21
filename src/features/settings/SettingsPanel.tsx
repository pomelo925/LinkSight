import { useCallback, useEffect, useState } from "react";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HOVER_POP_GROUP } from "@/lib/interactive";
import { cn } from "@/lib/utils";
import { LOCALES, type Locale } from "@/lib/i18n";
import { FONT_SIZES, FONT_SIZE_PREVIEW_PX, type FontSize } from "@/lib/fontSize";
import { THEMES, type ThemeId } from "@/lib/theme";
import { useI18n } from "@/hooks/useI18n";
import { useFontSizeStore } from "@/store/useFontSizeStore";
import { useThemeStore } from "@/store/useThemeStore";
import { useSettingsPreviewStore } from "@/store/useSettingsPreviewStore";
import { TracerouteSettingsForm } from "@/features/settings/TracerouteSettingsForm";
import { ConnectivitySettingsForm } from "@/features/settings/ConnectivitySettingsForm";

export type SettingsTab = "general" | "internet" | "p2p";
export type SettingsPanelVariant = "page" | "dialog";

export type SettingsSaveActions = {
  canSave: boolean;
  onSave: () => void;
};

const TABS: { id: SettingsTab; labelKey: string }[] = [
  { id: "general", labelKey: "settings.tabs.general" },
  { id: "internet", labelKey: "settings.tabs.internet" },
  { id: "p2p", labelKey: "settings.tabs.p2p" },
];

function SettingsTabBar({
  value,
  onChange,
}: {
  value: SettingsTab;
  onChange: (tab: SettingsTab) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="flex shrink-0 gap-1 border-b border-border px-3 pt-1">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={cn(
            "group -mb-px rounded-t-md border border-b-0 px-4 py-2.5 text-sm font-medium transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            value === tab.id
              ? "border-border bg-card text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          <span className={cn("inline-block", HOVER_POP_GROUP)}>{t(tab.labelKey)}</span>
        </button>
      ))}
    </div>
  );
}

function SettingsSection({
  title,
  description,
  children,
  bordered,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  bordered?: boolean;
}) {
  return (
    <section className={cn(bordered && "border-t border-border pt-6")}>
      <h3 className="text-sm font-semibold">{title}</h3>
      {description && (
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      )}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function LanguageSelector({
  value,
  onChange,
}: {
  value: Locale;
  onChange: (locale: Locale) => void;
}) {
  return (
    <div className="grid max-w-xs grid-cols-2 gap-2">
      {LOCALES.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            "group whitespace-nowrap rounded-md border px-3 py-2 text-sm font-medium transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            value === opt.value
              ? "border-primary bg-primary/10 text-primary"
              : "border-input text-muted-foreground hover:border-primary/50 hover:text-foreground",
          )}
        >
          <span className={cn("inline-block", HOVER_POP_GROUP)}>{opt.label}</span>
        </button>
      ))}
    </div>
  );
}

function FontSizeSelector({
  value,
  onChange,
}: {
  value: FontSize;
  onChange: (fontSize: FontSize) => void;
}) {
  const { t } = useI18n();

  return (
    <div className="grid max-w-md grid-cols-3 gap-2">
      {FONT_SIZES.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            "group flex flex-col items-center gap-1 rounded-md border px-3 py-3 transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            value === opt.value
              ? "border-primary bg-primary/10 text-primary"
              : "border-input text-muted-foreground hover:border-primary/50 hover:text-foreground",
          )}
        >
          <span className={cn("flex flex-col items-center gap-1", HOVER_POP_GROUP)}>
            <span
              className="font-semibold leading-none"
              style={{ fontSize: FONT_SIZE_PREVIEW_PX[opt.value] }}
              aria-hidden
            >
              Aa
            </span>
            <span className="whitespace-nowrap text-xs font-medium">{t(opt.labelKey)}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

function ThemeSelector({
  value,
  onChange,
}: {
  value: ThemeId;
  onChange: (theme: ThemeId) => void;
}) {
  const { t } = useI18n();

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {THEMES.map((theme) => (
        <button
          key={theme.id}
          type="button"
          onClick={() => onChange(theme.id)}
          className={cn(
            "group flex flex-col gap-2 rounded-lg border p-3 text-left transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            value === theme.id
              ? "border-primary bg-primary/10"
              : "border-input hover:border-primary/50",
          )}
        >
          <span className={cn("flex flex-col gap-2", HOVER_POP_GROUP)}>
            <div
              className="flex h-7 overflow-hidden rounded-md border border-border/40"
              aria-hidden
            >
              {theme.swatches.map((color) => (
                <span key={color} className="min-w-0 flex-1" style={{ backgroundColor: color }} />
              ))}
            </div>
            <span
              className={cn(
                "text-sm font-medium",
                value === theme.id ? "text-primary" : "text-foreground",
              )}
            >
              {t(theme.labelKey)}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}

function GeneralSettings({
  resetToken,
  onSaveActionsChange,
}: {
  resetToken?: number;
  onSaveActionsChange?: (actions: SettingsSaveActions | null) => void;
}) {
  const { committedLocale, setLocale, t } = useI18n();
  const fontSize = useFontSizeStore((s) => s.fontSize);
  const setFontSize = useFontSizeStore((s) => s.setFontSize);
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const setPreview = useSettingsPreviewStore((s) => s.setPreview);
  const clearPreview = useSettingsPreviewStore((s) => s.clearPreview);

  const [draftLocale, setDraftLocale] = useState(committedLocale);
  const [draftFontSize, setDraftFontSize] = useState(fontSize);
  const [draftTheme, setDraftTheme] = useState(theme);

  // Rehydrate drafts from committed stores (dialog reopen / external change).
  useEffect(() => {
    setDraftLocale(committedLocale);
    setDraftFontSize(fontSize);
    setDraftTheme(theme);
    clearPreview();
  }, [committedLocale, fontSize, theme, resetToken, clearPreview]);

  const dirty =
    draftLocale !== committedLocale ||
    draftFontSize !== fontSize ||
    draftTheme !== theme;

  // Live preview without touching persisted stores.
  useEffect(() => {
    if (!dirty) {
      clearPreview();
      return;
    }
    setPreview({
      locale: draftLocale,
      fontSize: draftFontSize,
      theme: draftTheme,
    });
  }, [dirty, draftLocale, draftFontSize, draftTheme, setPreview, clearPreview]);

  // Leaving settings without Save reverts the live preview.
  useEffect(() => () => clearPreview(), [clearPreview]);

  const handleSave = useCallback(() => {
    setLocale(draftLocale);
    setFontSize(draftFontSize);
    setTheme(draftTheme);
    clearPreview();
  }, [
    draftLocale,
    draftFontSize,
    draftTheme,
    setLocale,
    setFontSize,
    setTheme,
    clearPreview,
  ]);

  useEffect(() => {
    if (!onSaveActionsChange) return;
    onSaveActionsChange({ canSave: dirty, onSave: handleSave });
    return () => onSaveActionsChange(null);
  }, [dirty, handleSave, onSaveActionsChange]);

  return (
    <div className="space-y-6">
      <SettingsSection
        title={t("settings.language.title")}
        description={t("settings.language.description")}
      >
        <LanguageSelector value={draftLocale} onChange={setDraftLocale} />
      </SettingsSection>

      <SettingsSection
        title={t("settings.fontSize.title")}
        description={t("settings.fontSize.description")}
        bordered
      >
        <FontSizeSelector value={draftFontSize} onChange={setDraftFontSize} />
      </SettingsSection>

      <SettingsSection
        title={t("settings.theme.title")}
        description={t("settings.theme.description")}
        bordered
      >
        <ThemeSelector value={draftTheme} onChange={setDraftTheme} />
      </SettingsSection>
    </div>
  );
}

export function SettingsTabContent({
  tab,
  variant = "page",
  resetToken,
  onSaveActionsChange,
}: {
  tab: SettingsTab;
  variant?: SettingsPanelVariant;
  resetToken?: number;
  onSaveActionsChange?: (actions: SettingsSaveActions | null) => void;
}) {
  const { t } = useI18n();

  if (tab === "general") {
    return (
      <GeneralSettings
        resetToken={resetToken}
        onSaveActionsChange={onSaveActionsChange}
      />
    );
  }
  if (tab === "internet") {
    return (
      <SettingsSection
        title={t("settings.tabs.internet")}
        description={t("settings.internet.description")}
      >
        <TracerouteSettingsForm
          resetToken={resetToken}
          onSaveActionsChange={onSaveActionsChange}
        />
      </SettingsSection>
    );
  }
  return (
    <SettingsSection
      title={t("settings.tabs.p2p")}
      description={t("settings.p2p.description")}
    >
      <ConnectivitySettingsForm
        variant={variant === "dialog" ? "dialog" : "inline"}
        resetToken={resetToken}
        onSaveActionsChange={onSaveActionsChange}
      />
    </SettingsSection>
  );
}

export function SettingsFooter({ embedded }: { embedded?: boolean }) {
  const { t } = useI18n();
  return (
    <div
      className={cn(
        "flex shrink-0 items-end justify-between gap-4",
        !embedded && "border-t border-border/40 pt-4",
      )}
    >
      <div className="space-y-0.5 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">{t("settings.about.title")}</p>
        <p>{t("settings.about.version", { version: __APP_VERSION__ })}</p>
        <p>{t("settings.about.stack")}</p>
      </div>
      <p className="shrink-0 text-xs text-muted-foreground">{t("settings.about.copyright")}</p>
    </div>
  );
}

/** Tabbed settings shell — shared by the Settings page and the settings dialog. */
export function SettingsPanel({
  tab,
  onTabChange,
  className,
  variant = "page",
  resetToken,
}: {
  tab: SettingsTab;
  onTabChange: (tab: SettingsTab) => void;
  className?: string;
  variant?: SettingsPanelVariant;
  resetToken?: number;
}) {
  const { t } = useI18n();
  const [saveActions, setSaveActions] = useState<SettingsSaveActions | null>(null);

  return (
    <div
      className={cn(
        "flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card",
        className,
      )}
    >
      <SettingsTabBar value={tab} onChange={onTabChange} />
      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        <SettingsTabContent
          tab={tab}
          variant={variant}
          resetToken={resetToken}
          onSaveActionsChange={setSaveActions}
        />
      </div>
      {saveActions && (
        <div className="flex shrink-0 justify-start border-t border-border bg-card px-5 py-3">
          <Button
            size="sm"
            disabled={!saveActions.canSave}
            onClick={() => saveActions.onSave()}
          >
            <Save className="h-4 w-4" />
            {t("settings.save")}
          </Button>
        </div>
      )}
    </div>
  );
}
