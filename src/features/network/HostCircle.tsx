import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const SIZE_STYLES = {
  default: {
    circle: "h-52 w-52",
    icon: "h-10 w-10",
    title: "text-sm",
    subtitle: "text-xs",
  },
  lg: {
    circle: "h-64 w-64 md:h-72 md:w-72",
    icon: "h-12 w-12 md:h-14 md:w-14",
    title: "text-base md:text-lg",
    subtitle: "text-sm",
  },
} as const;

/**
 * The large peer circle used on both Home and the Connectivity page. Kept in
 * one place so the two circles look identical across the page transition.
 */
export function HostCircle({
  icon: Icon,
  title,
  subtitle,
  dashed,
  size = "default",
  onClick,
  children,
}: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  dashed?: boolean;
  size?: keyof typeof SIZE_STYLES;
  onClick?: () => void;
  children?: React.ReactNode;
}) {
  const styles = SIZE_STYLES[size];

  return (
    <div className="flex flex-col items-center gap-3">
      <button
        type="button"
        onClick={onClick}
        disabled={!onClick}
        className={cn(
          "group relative flex flex-col items-center justify-center gap-2 rounded-full text-center",
          styles.circle,
          dashed
            ? "group text-muted-foreground transition-[transform,color] transition-duration-[350ms] ease-in-out hover:scale-[1.045] hover:text-primary"
            : "border-2 border-primary/60 bg-card",
          onClick &&
            "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
      >
        {dashed ? (
          <svg
            aria-hidden
            className="host-circle-dashed pointer-events-none absolute inset-0 text-border transition-[transform,color] transition-duration-[350ms] ease-in-out group-hover:rotate-[45deg] group-hover:text-primary"
            viewBox="0 0 100 100"
          >
            <circle
              cx="50"
              cy="50"
              r="47"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeDasharray="8 8"
            />
          </svg>
        ) : null}
        <div className={cn("relative z-10 flex flex-col items-center gap-2", !dashed && "bg-card")}>
          <Icon className={styles.icon} />
          <div className="px-4">
            <p className={cn("font-semibold leading-tight", styles.title)}>{title}</p>
            <p className={cn("mt-0.5 text-muted-foreground", styles.subtitle)}>{subtitle}</p>
          </div>
        </div>
      </button>
      {children}
    </div>
  );
}
