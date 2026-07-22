import type { LucideIcon } from "lucide-react";
import { HOVER_POP_GROUP } from "@/lib/interactive";
import { cn } from "@/lib/utils";

const SIZE_STYLES = {
  sm: {
    wrap: "flex flex-col items-center gap-3",
    circle: "h-28 w-28",
    icon: "h-6 w-6",
    title: "text-xs",
    subtitle: "text-[10px] leading-tight",
    footer: "text-[9px] leading-tight",
    gap: "gap-2",
  },
  default: {
    wrap: "flex flex-col items-center gap-3",
    circle: "h-52 w-52",
    icon: "h-10 w-10",
    title: "text-sm",
    subtitle: "text-xs",
    footer: "text-[11px] leading-tight",
    gap: "gap-2",
  },
  lg: {
    wrap: "flex flex-col items-center gap-3",
    circle: "h-64 w-64 md:h-72 md:w-72",
    icon: "h-12 w-12 md:h-14 md:w-14",
    title: "text-base md:text-lg",
    subtitle: "text-sm",
    footer: "text-xs",
    gap: "gap-2",
  },
  /** Fluid: fills parent; parent should be a square (or max-square) box. */
  fill: {
    wrap: "flex h-full w-full min-h-0 min-w-0 items-center justify-center",
    circle: "h-full w-full min-h-0 min-w-0",
    icon: "h-[22%] w-[22%] max-h-24 max-w-24 min-h-12 min-w-12",
    title: "text-[clamp(1rem,5.5cqw,1.75rem)]",
    subtitle: "text-[clamp(0.85rem,4cqw,1.25rem)]",
    footer: "text-[clamp(0.75rem,3.2cqw,1rem)]",
    gap: "gap-[4%]",
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
  footer,
  dashed,
  size = "default",
  onClick,
  children,
  className,
}: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  /** Optional third line inside the circle (e.g. remote MAC). */
  footer?: string | null;
  dashed?: boolean;
  size?: keyof typeof SIZE_STYLES;
  onClick?: () => void;
  children?: React.ReactNode;
  className?: string;
}) {
  const styles = SIZE_STYLES[size];
  const fill = size === "fill";
  const interactive = Boolean(onClick);

  return (
    <div className={cn(styles.wrap, className)}>
      <button
        type="button"
        onClick={onClick}
        disabled={!onClick}
        className={cn(
          "group relative flex flex-col items-center justify-center rounded-full text-center",
          styles.gap,
          styles.circle,
          fill && "[container-type:size]",
          dashed
            ? "text-muted-foreground transition-[transform,color] transition-duration-[350ms] ease-in-out hover:scale-[1.045] hover:text-primary"
            : "border-2 border-primary/60 bg-card",
          interactive &&
            !dashed &&
            "cursor-pointer transition-colors duration-150 hover:border-primary hover:text-primary",
          interactive &&
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
        <div
          className={cn(
            "relative z-10 flex max-w-[78%] flex-col items-center",
            styles.gap,
            !dashed && "bg-card",
            interactive && HOVER_POP_GROUP,
          )}
        >
          <Icon className={cn("shrink-0", styles.icon)} />
          <div className="w-max max-w-full px-1 text-center">
            <p className={cn("whitespace-nowrap font-semibold leading-tight", styles.title)}>
              {title}
            </p>
            <p
              className={cn(
                "mt-0.5 whitespace-nowrap text-muted-foreground",
                styles.subtitle,
              )}
            >
              {subtitle}
            </p>
            {footer ? (
              <p
                className={cn(
                  "mt-1 whitespace-nowrap font-mono uppercase tracking-wide text-muted-foreground/90",
                  styles.footer,
                )}
                title={footer}
              >
                {footer}
              </p>
            ) : null}
          </div>
        </div>
      </button>
      {children}
    </div>
  );
}
