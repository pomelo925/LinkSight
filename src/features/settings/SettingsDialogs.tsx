import { useEffect, useState } from "react";
import { CenterDialog } from "@/components/ui/center-dialog";
import { useI18n } from "@/hooks/useI18n";
import { SettingsPanel, type SettingsTab } from "./SettingsPanel";

/**
 * Shared settings popup — same shell everywhere.
 * Callers only differ by which tab opens first (`defaultTab`).
 */
export function SettingsDialog({
  open,
  onClose,
  defaultTab = "general",
}: {
  open: boolean;
  onClose: () => void;
  defaultTab?: SettingsTab;
}) {
  const { t } = useI18n();
  const [tab, setTab] = useState<SettingsTab>(defaultTab);
  const [resetToken, setResetToken] = useState(0);

  useEffect(() => {
    if (open) {
      setTab(defaultTab);
      setResetToken((n) => n + 1);
    }
  }, [open, defaultTab]);

  return (
    <CenterDialog
      open={open}
      onClose={onClose}
      title={t("settings.title")}
      className="flex h-[min(85vh,44rem)] w-full max-w-2xl flex-col"
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
    >
      <SettingsPanel
        tab={tab}
        onTabChange={setTab}
        className="min-h-0 flex-1 rounded-none border-0"
        variant="dialog"
        resetToken={resetToken}
      />
    </CenterDialog>
  );
}

/** @deprecated Use SettingsDialog with defaultTab="p2p". */
export function ConnectivitySettingsDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return <SettingsDialog open={open} onClose={onClose} defaultTab="p2p" />;
}
