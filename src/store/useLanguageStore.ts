import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Locale } from "@/lib/i18n";

interface LanguageState {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

export const useLanguageStore = create<LanguageState>()(
  persist(
    (set) => ({
      locale: "en",
      setLocale: (locale) => set({ locale }),
    }),
    { name: "linksight-locale" },
  ),
);
