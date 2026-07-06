export type FontSize = "sm" | "md" | "lg";

export const DEFAULT_FONT_SIZE: FontSize = "sm";

export const FONT_SIZES: { value: FontSize; labelKey: string }[] = [
  { value: "sm", labelKey: "settings.fontSize.sm" },
  { value: "md", labelKey: "settings.fontSize.md" },
  { value: "lg", labelKey: "settings.fontSize.lg" },
];

export const FONT_SIZE_CLASS: Record<FontSize, string> = {
  sm: "font-size-sm",
  md: "font-size-md",
  lg: "font-size-lg",
};

/** Preview sample size (px) shown in the settings picker — independent of the live scale. */
export const FONT_SIZE_PREVIEW_PX: Record<FontSize, number> = {
  sm: 16,
  md: 18,
  lg: 20,
};
