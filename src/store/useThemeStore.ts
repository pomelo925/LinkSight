import { create } from "zustand";
import { persist } from "zustand/middleware";
import { ALL_THEME_IDS, DEFAULT_THEME, type ThemeId } from "@/lib/theme";

interface ThemeState {
  theme: ThemeId;
  setTheme: (theme: ThemeId) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: DEFAULT_THEME,
      setTheme: (theme) => set({ theme }),
    }),
    {
      name: "linksight-theme",
      // Fall back to the default if a removed theme (e.g. lagoon-teal) was persisted.
      merge: (persisted, current) => {
        const saved = (persisted as Partial<ThemeState> | undefined)?.theme;
        const theme =
          saved && (ALL_THEME_IDS as readonly string[]).includes(saved)
            ? (saved as ThemeId)
            : DEFAULT_THEME;
        return { ...current, theme };
      },
    },
  ),
);
