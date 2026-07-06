import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The large peer circle used on both Home and the Connectivity page. Kept in
 * one place so the two circles look identical across the page transition.
 */
export function HostCircle({
  icon: Icon,
  title,
  subtitle,
  dashed,
  onClick,
  children,
}: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  dashed?: boolean;
  onClick?: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3">
      <button
        type="button"
        onClick={onClick}
        disabled={!onClick}
        className={cn(
          "flex h-52 w-52 flex-col items-center justify-center gap-2 rounded-full border-2 bg-card text-center",
          dashed
            ? "border-dashed border-border text-muted-foreground transition-colors hover:border-primary hover:text-primary"
            : "border-primary/60",
          onClick &&
            "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
      >
        <Icon className="h-10 w-10" />
        <div className="px-4">
          <p className="text-sm font-semibold leading-tight">{title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </button>
      {children}
    </div>
  );
}
