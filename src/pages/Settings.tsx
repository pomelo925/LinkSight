import { useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { useI18n } from "@/hooks/useI18n";
import {
  SettingsFooter,
  SettingsPanel,
  type SettingsTab,
} from "@/features/settings/SettingsPanel";

export function Settings() {
  const { t } = useI18n();
  const [tab, setTab] = useState<SettingsTab>("general");

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden gap-4">
      <PageHeader title={t("settings.title")} description={t("settings.description")} />

      <SettingsPanel
        tab={tab}
        onTabChange={setTab}
        className="min-h-0 flex-1"
      />

      <SettingsFooter />
    </div>
  );
}
