import { HOVER_POP_GROUP } from "@/lib/interactive";
import { cn } from "@/lib/utils";

interface FieldTriggerProps {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

/** Clickable field that opens a sub-panel — hover/focus ring for interaction feedback. */
export function FieldTrigger({
  icon,
  label,
  active,
  disabled,
  onClick,
}: FieldTriggerProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "group flex h-10 w-full items-center gap-2 rounded-md border border-input bg-background px-3 text-left text-sm",
        !disabled &&
          "hover:border-primary/50 hover:bg-accent/30 focus-visible:outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring",
        active && !disabled && "border-primary ring-2 ring-ring",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      <span className={cn("inline-flex min-w-0 items-center gap-2", HOVER_POP_GROUP)}>
        <span className="shrink-0 text-muted-foreground">{icon}</span>
        <span
          className={cn(
            "min-w-0 truncate",
            label ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {label}
        </span>
      </span>
    </button>
  );
}
