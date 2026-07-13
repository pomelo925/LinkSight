import { useCallback } from "react";
import { translate, type Locale, type TranslateParams } from "@/lib/i18n";
import { useLanguageStore } from "@/store/useLanguageStore";
import { useSettingsPreviewStore } from "@/store/useSettingsPreviewStore";

export function useI18n() {
  const committedLocale = useLanguageStore((s) => s.locale);
  const setLocale = useLanguageStore((s) => s.setLocale);
  const previewLocale = useSettingsPreviewStore((s) => s.locale);
  const locale = previewLocale ?? committedLocale;

  const t = useCallback(
    (key: string, params?: TranslateParams) => translate(locale, key, params),
    [locale],
  );

  return { locale, committedLocale, setLocale, t };
}

export type { Locale };
