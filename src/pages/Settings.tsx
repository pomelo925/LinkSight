import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { LOCALES, type Locale } from "@/lib/i18n";
import { FONT_SIZES, FONT_SIZE_PREVIEW_PX, type FontSize } from "@/lib/fontSize";
import { THEMES, type ThemeId } from "@/lib/theme";
import { useI18n } from "@/hooks/useI18n";
import { useFontSizeStore } from "@/store/useFontSizeStore";
import { useThemeStore } from "@/store/useThemeStore";

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
            "whitespace-nowrap rounded-md border px-3 py-2 text-sm font-medium transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            value === opt.value
              ? "border-primary bg-primary/10 text-primary"
              : "border-input text-muted-foreground hover:border-primary/50 hover:text-foreground",
          )}
        >
          {opt.label}
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
            "flex flex-col items-center gap-1 rounded-md border px-3 py-3 transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            value === opt.value
              ? "border-primary bg-primary/10 text-primary"
              : "border-input text-muted-foreground hover:border-primary/50 hover:text-foreground",
          )}
        >
          <span
            className="font-semibold leading-none"
            style={{ fontSize: FONT_SIZE_PREVIEW_PX[opt.value] }}
            aria-hidden
          >
            Aa
          </span>
          <span className="whitespace-nowrap text-xs font-medium">{t(opt.labelKey)}</span>
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
            "flex flex-col gap-2 rounded-lg border p-3 text-left transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            value === theme.id
              ? "border-primary bg-primary/10"
              : "border-input hover:border-primary/50",
          )}
        >
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
        </button>
      ))}
    </div>
  );
}

export function Settings() {
  const { locale, setLocale, t } = useI18n();
  const fontSize = useFontSizeStore((s) => s.fontSize);
  const setFontSize = useFontSizeStore((s) => s.setFontSize);
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);

  return (
    <div>
      <PageHeader title={t("settings.title")} description={t("settings.description")} />

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>{t("settings.language.title")}</CardTitle>
            <CardDescription>{t("settings.language.description")}</CardDescription>
          </CardHeader>
          <CardContent>
            <LanguageSelector value={locale} onChange={setLocale} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("settings.fontSize.title")}</CardTitle>
            <CardDescription>{t("settings.fontSize.description")}</CardDescription>
          </CardHeader>
          <CardContent>
            <FontSizeSelector value={fontSize} onChange={setFontSize} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("settings.theme.title")}</CardTitle>
            <CardDescription>{t("settings.theme.description")}</CardDescription>
          </CardHeader>
          <CardContent>
            <ThemeSelector value={theme} onChange={setTheme} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("settings.about.title")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm text-muted-foreground">
            <p>{t("settings.about.version")}</p>
            <p>{t("settings.about.tagline")}</p>
            <p>{t("settings.about.stack")}</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
