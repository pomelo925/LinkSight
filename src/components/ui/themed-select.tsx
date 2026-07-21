import * as React from "react";
import { ChevronDown } from "lucide-react";
import { HOVER_POP_GROUP } from "@/lib/interactive";
import { cn } from "@/lib/utils";

export type ThemedSelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

export type ThemedSelectProps = {
  value: string;
  options: ThemedSelectOption[];
  onChange: (value: string) => void;
  className?: string;
  "aria-label"?: string;
  disabled?: boolean;
};

/**
 * Theme-aware select. Native `<select>` option menus ignore CSS variables in
 * WebKit/Tauri, so this renders a custom panel with palette tokens.
 */
export function ThemedSelect({
  value,
  options,
  onChange,
  className,
  "aria-label": ariaLabel,
  disabled,
}: ThemedSelectProps) {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value) ?? options[0];

  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "group flex h-10 w-full items-center justify-between gap-2 rounded-md border border-input",
          "bg-background px-3 py-2 text-left text-sm text-foreground",
          "ring-offset-background hover:border-primary/50",
          "focus-visible:outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring",
          "disabled:cursor-not-allowed disabled:opacity-50",
        )}
      >
        <span className={cn("inline-flex min-w-0 flex-1 items-center justify-between gap-2", HOVER_POP_GROUP)}>
          <span className="min-w-0 truncate">{selected?.label}</span>
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
              open && "rotate-180",
            )}
          />
        </span>
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label={ariaLabel}
          className={cn(
            "absolute right-0 z-50 mt-1 max-h-60 min-w-full overflow-auto rounded-md border border-border",
            "bg-card py-1 text-card-foreground shadow-lg",
          )}
        >
          {options.map((opt) => {
            const active = opt.value === value;
            return (
              <li key={opt.value} role="option" aria-selected={active}>
                <button
                  type="button"
                  disabled={opt.disabled}
                  onClick={() => {
                    if (opt.disabled) return;
                    onChange(opt.value);
                    setOpen(false);
                  }}
                  className={cn(
                    "group flex w-full items-center px-3 py-2 text-left text-sm transition-colors",
                    "focus-visible:outline-none focus-visible:bg-accent focus-visible:text-accent-foreground",
                    "disabled:cursor-not-allowed disabled:opacity-50",
                    active
                      ? "bg-primary/15 text-primary"
                      : "text-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <span className={cn("inline-block", HOVER_POP_GROUP)}>{opt.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
