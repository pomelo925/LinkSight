export type ThemeId =
  | "default"
  | "monokai"
  | "watermelon"
  | "rose-charcoal";

export const DEFAULT_THEME: ThemeId = "rose-charcoal";

export const THEMES: {
  id: ThemeId;
  labelKey: string;
  /** Hex swatches shown in the settings picker (left → right). */
  swatches: string[];
}[] = [
  {
    id: "rose-charcoal",
    labelKey: "settings.theme.roseCharcoal",
    swatches: ["#282828", "#EAEAEA", "#CC527A", "#E8175D", "#B0B0B0"],
  },
  {
    id: "default",
    labelKey: "settings.theme.slateBlue",
    swatches: ["#0f172a", "#1e293b", "#38bdf8", "#64748b", "#22c55e"],
  },
  {
    id: "monokai",
    labelKey: "settings.theme.monokai",
    swatches: ["#272822", "#66D9EF", "#A6E22E", "#FD971F", "#F92672"],
  },
  {
    id: "watermelon",
    labelKey: "settings.theme.watermelon",
    swatches: ["#2A363B", "#99B898", "#FECEA8", "#FF847C", "#E84A5F"],
  },
];

export const THEME_CLASS: Record<ThemeId, string> = {
  default: "theme-default",
  monokai: "theme-monokai",
  watermelon: "theme-watermelon",
  "rose-charcoal": "theme-rose-charcoal",
};

export const ALL_THEME_IDS = THEMES.map((t) => t.id);
