import { ChevronDown, ChevronsUpDown, ChevronUp } from "lucide-react";
import { HOVER_POP_GROUP } from "@/lib/interactive";
import { cn } from "@/lib/utils";

type SortDir = "asc" | "desc";

interface SortHeaderProps<K extends string> {
  label: string;
  col: K;
  sortKey: K;
  sortDir: SortDir;
  onSort: (key: K) => void;
  /** Extra classes on the button (alignment, casing, etc.). */
  className?: string;
}

/**
 * Clickable table column header with sort indicator and shared hover pop.
 */
export function SortHeader<K extends string>({
  label,
  col,
  sortKey,
  sortDir,
  onSort,
  className,
}: SortHeaderProps<K>) {
  const active = sortKey === col;
  const Indicator = !active
    ? ChevronsUpDown
    : sortDir === "asc"
      ? ChevronUp
      : ChevronDown;

  return (
    <button
      type="button"
      onClick={() => onSort(col)}
      className={cn(
        "group flex h-full w-full min-w-0 items-center gap-1 px-1.5 py-2 text-left transition-colors hover:text-foreground",
        active ? "bg-primary/10 text-foreground" : "text-muted-foreground",
        className,
      )}
    >
      <span className={cn("inline-flex min-w-0 items-center gap-1", HOVER_POP_GROUP)}>
        <span className="truncate">{label}</span>
        <Indicator className={cn("h-3 w-3 shrink-0", !active && "opacity-40")} />
      </span>
    </button>
  );
}
