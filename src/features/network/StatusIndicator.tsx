import { motion } from "framer-motion";
import { Loader2, CheckCircle2, XCircle, Circle, Search } from "lucide-react";
import type { TestStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const CONFIG: Record<
  TestStatus,
  { label: string; icon: typeof Circle; className: string; spin?: boolean }
> = {
  idle: { label: "Idle", icon: Circle, className: "text-muted-foreground" },
  running: {
    label: "Running",
    icon: Loader2,
    className: "text-primary",
    spin: true,
  },
  analyzing: {
    label: "Analyzing",
    icon: Search,
    className: "text-primary",
    spin: true,
  },
  success: { label: "Success", icon: CheckCircle2, className: "text-success" },
  failed: { label: "Failed", icon: XCircle, className: "text-destructive" },
};

export function StatusIndicator({ status }: { status: TestStatus }) {
  const { label, icon: Icon, className, spin } = CONFIG[status];
  return (
    <motion.div
      key={status}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className={cn("flex items-center gap-2 text-sm font-medium", className)}
    >
      <Icon className={cn("h-4 w-4", spin && "animate-spin")} />
      <span>{label}</span>
    </motion.div>
  );
}
