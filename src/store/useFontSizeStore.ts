import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DEFAULT_FONT_SIZE, type FontSize } from "@/lib/fontSize";

interface FontSizeState {
  fontSize: FontSize;
  setFontSize: (fontSize: FontSize) => void;
}

export const useFontSizeStore = create<FontSizeState>()(
  persist(
    (set) => ({
      fontSize: DEFAULT_FONT_SIZE,
      setFontSize: (fontSize) => set({ fontSize }),
    }),
    { name: "linksight-font-size" },
  ),
);
