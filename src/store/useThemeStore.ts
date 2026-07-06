import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DEFAULT_THEME, type ThemeId } from "@/lib/theme";

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
    { name: "linksight-theme" },
  ),
);
