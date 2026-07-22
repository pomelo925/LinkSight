import { Square } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Run / Stop toggle for connection tests. Width stays stable so the layout
 * does not jump when the label flips.
 */
export function TestRunStopButton({
  running,
  onRun,
  onStop,
  runLabel,
  stopLabel,
  runIcon: RunIcon,
  disabled,
  size = "sm",
  className,
  minWidthClass = "min-w-[11.5rem]",
}: {
  running: boolean;
  onRun: () => void;
  onStop: () => void;
  runLabel: string;
  stopLabel: string;
  runIcon: LucideIcon;
  disabled?: boolean;
  size?: "sm" | "lg" | "default";
  className?: string;
  /** Fixed width so Run ↔ Stop does not resize the control. */
  minWidthClass?: string;
}) {
  return (
    <Button
      type="button"
      size={size}
      variant={running ? "destructive" : "default"}
      className={cn(minWidthClass, "justify-center", className)}
      disabled={!running && disabled}
      onClick={running ? onStop : onRun}
    >
      {running ? <Square className="h-4 w-4" /> : <RunIcon className="h-4 w-4" />}
      {running ? stopLabel : runLabel}
    </Button>
  );
}
