import { useCallback } from "react";
import { translate, type Locale, type TranslateParams } from "@/lib/i18n";
import { useLanguageStore } from "@/store/useLanguageStore";

export function useI18n() {
  const locale = useLanguageStore((s) => s.locale);
  const setLocale = useLanguageStore((s) => s.setLocale);

  const t = useCallback(
    (key: string, params?: TranslateParams) => translate(locale, key, params),
    [locale],
  );

  return { locale, setLocale, t };
}

export type { Locale };
