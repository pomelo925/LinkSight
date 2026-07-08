import { SettingsDialog } from "@/features/settings/SettingsDialogs";

/** @deprecated Use SettingsDialog with defaultTab="p2p" */
export function ConnectivitySettingsDialog({ onClose }: { onClose: () => void }) {
  return <SettingsDialog open onClose={onClose} defaultTab="p2p" />;
}
