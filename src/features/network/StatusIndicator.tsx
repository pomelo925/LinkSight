import { motion } from "framer-motion";
import { Loader2, CheckCircle2, XCircle, Circle, Search } from "lucide-react";
import { useI18n } from "@/hooks/useI18n";
import type { TestStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const CONFIG: Record<
  TestStatus,
  { labelKey: string; icon: typeof Circle; className: string; spin?: boolean }
> = {
  idle: { labelKey: "common.status.idle", icon: Circle, className: "text-muted-foreground" },
  running: {
    labelKey: "common.status.running",
    icon: Loader2,
    className: "text-primary",
    spin: true,
  },
  analyzing: {
    labelKey: "common.status.analyzing",
    icon: Search,
    className: "text-primary",
    spin: true,
  },
  success: { labelKey: "common.status.success", icon: CheckCircle2, className: "text-success" },
  failed: { labelKey: "common.status.failed", icon: XCircle, className: "text-destructive" },
};

export function StatusIndicator({ status }: { status: TestStatus }) {
  const { t } = useI18n();
  const { labelKey, icon: Icon, className, spin } = CONFIG[status];
  return (
    <motion.div
      key={status}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className={cn("flex items-center gap-2 text-sm font-medium", className)}
    >
      <Icon className={cn("h-4 w-4", spin && "animate-spin")} />
      <span>{t(labelKey)}</span>
    </motion.div>
  );
}
