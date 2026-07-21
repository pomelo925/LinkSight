/** Shared hover “pop” affordances for clickable chrome. */

/** Mild enlarge on the control itself (buttons, refresh, etc.). */
export const HOVER_POP = "transition-transform duration-150 hover:scale-110";

/** Stronger enlarge for compact icon-only controls (status, ⋮, info). */
export const HOVER_POP_ICON = "transition-transform duration-150 hover:scale-125";

/** Mild enlarge for tiny status glyphs. */
export const HOVER_POP_STATUS =
  "transition-transform duration-150 hover:scale-110";

/**
 * Inner content scale when the parent uses Tailwind `group`
 * (sort headers, menu rows, filled buttons).
 */
export const HOVER_POP_GROUP =
  "transition-transform duration-150 group-hover:scale-105 group-active:scale-100";

/** Subtle row pop — file lists where full 1.05 feels too strong. */
export const HOVER_POP_GROUP_SUBTLE =
  "transition-transform duration-150 group-hover:scale-[1.02] group-active:scale-100";
