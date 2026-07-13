import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Locale } from "@/lib/i18n";

export const DEFAULT_LOCALE: Locale = "en";

interface LanguageState {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

export const useLanguageStore = create<LanguageState>()(
  persist(
    (set) => ({
      locale: DEFAULT_LOCALE,
      setLocale: (locale) => set({ locale }),
    }),
    {
      name: "linksight-locale",
      // v2: product default English. Clears stale locale from older installs (e.g. v0.2.x).
      version: 2,
      migrate: () => ({ locale: DEFAULT_LOCALE }),
    },
  ),
);
