import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

const TOOLTIP_WIDTH_PX = 240;
const TOOLTIP_GAP_PX = 6;
const HIDE_DELAY_MS = 80;

interface InfoHintProps {
  ariaLabel: string;
  title?: string;
  body: string;
  /** Tooltip horizontal alignment relative to the icon. */
  align?: "start" | "end";
  className?: string;
}

/**
 * Information hint shown on hover — portaled above the icon so it is never
 * clipped by parent overflow. Disappears when the pointer leaves.
 */
export function InfoHint({
  ariaLabel,
  title,
  body,
  align = "start",
  className,
}: InfoHintProps) {
  const tooltipId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const hideTimerRef = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current != null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    let left =
      align === "end" ? rect.right - TOOLTIP_WIDTH_PX : rect.left;
    left = Math.max(
      8,
      Math.min(left, window.innerWidth - TOOLTIP_WIDTH_PX - 8),
    );

    setPosition({
      top: rect.top - TOOLTIP_GAP_PX,
      left,
    });
  }, [align]);

  const show = useCallback(() => {
    clearHideTimer();
    updatePosition();
    setOpen(true);
  }, [clearHideTimer, updatePosition]);

  const scheduleHide = useCallback(() => {
    clearHideTimer();
    hideTimerRef.current = window.setTimeout(() => setOpen(false), HIDE_DELAY_MS);
  }, [clearHideTimer]);

  useEffect(() => {
    if (!open) return;
    const onLayoutChange = () => updatePosition();
    window.addEventListener("resize", onLayoutChange);
    window.addEventListener("scroll", onLayoutChange, true);
    return () => {
      window.removeEventListener("resize", onLayoutChange);
      window.removeEventListener("scroll", onLayoutChange, true);
    };
  }, [open, updatePosition]);

  useEffect(() => () => clearHideTimer(), [clearHideTimer]);

  const tooltip =
    open &&
    createPortal(
      <span
        id={tooltipId}
        role="tooltip"
        style={{ top: position.top, left: position.left, width: TOOLTIP_WIDTH_PX }}
        className={cn(
          "pointer-events-auto fixed z-[9999] -translate-y-full",
          "rounded-md border border-border/80 bg-card px-2.5 py-2 shadow-xl",
          "text-left text-[11px] leading-relaxed text-muted-foreground",
        )}
        onMouseEnter={show}
        onMouseLeave={scheduleHide}
      >
        {title ? (
          <span className="mb-1 block text-xs font-medium text-foreground">
            {title}
          </span>
        ) : null}
        {body}
      </span>,
      document.body,
    );

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        tabIndex={0}
        aria-label={ariaLabel}
        aria-describedby={open ? tooltipId : undefined}
        className={cn(
          "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full align-middle",
          "text-muted-foreground/70 transition-colors",
          "hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          className,
        )}
        onMouseEnter={show}
        onMouseLeave={scheduleHide}
        onFocus={show}
        onBlur={scheduleHide}
      >
        <Info className="h-3.5 w-3.5" strokeWidth={2} />
      </button>
      {tooltip}
    </>
  );
};
