import { create } from "zustand";
import type { FontSize } from "@/lib/fontSize";
import type { Locale } from "@/lib/i18n";
import type { ThemeId } from "@/lib/theme";

/**
 * Ephemeral appearance preview for Settings.
 * Applied by *Sync / useI18n for live preview; never written to localStorage.
 * Cleared on Save (after committing) or when the settings editor unmounts / resets.
 */
interface SettingsPreviewState {
  locale: Locale | null;
  fontSize: FontSize | null;
  theme: ThemeId | null;
  setPreview: (partial: {
    locale?: Locale | null;
    fontSize?: FontSize | null;
    theme?: ThemeId | null;
  }) => void;
  clearPreview: () => void;
}

export const useSettingsPreviewStore = create<SettingsPreviewState>((set) => ({
  locale: null,
  fontSize: null,
  theme: null,
  setPreview: (partial) => set(partial),
  clearPreview: () => set({ locale: null, fontSize: null, theme: null }),
}));
