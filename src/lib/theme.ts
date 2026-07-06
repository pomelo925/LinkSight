export type ThemeId =
  | "default"
  | "monokai"
  | "watermelon"
  | "rose-charcoal"
  | "lagoon-teal";

export const DEFAULT_THEME: ThemeId = "default";

export const THEMES: {
  id: ThemeId;
  labelKey: string;
  /** Hex swatches shown in the settings picker (left → right). */
  swatches: string[];
}[] = [
  {
    id: "default",
    labelKey: "settings.theme.default",
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
  {
    id: "rose-charcoal",
    labelKey: "settings.theme.roseCharcoal",
    swatches: ["#363636", "#A8A7A7", "#CC527A", "#E8175D", "#474747"],
  },
  {
    id: "lagoon-teal",
    labelKey: "settings.theme.lagoonTeal",
    swatches: ["#594F4F", "#E5FCC2", "#9DE0AD", "#45ADA8", "#547980"],
  },
];

export const THEME_CLASS: Record<ThemeId, string> = {
  default: "theme-default",
  monokai: "theme-monokai",
  watermelon: "theme-watermelon",
  "rose-charcoal": "theme-rose-charcoal",
  "lagoon-teal": "theme-lagoon-teal",
};

export const ALL_THEME_IDS = THEMES.map((t) => t.id);
