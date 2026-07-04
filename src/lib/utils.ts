import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge Tailwind class names with conflict resolution. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatMs(value: number | null | undefined): string {
  if (value == null) return "—";
  return `${value.toFixed(1)} ms`;
}
