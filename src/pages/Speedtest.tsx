import { PageHeader } from "@/components/layout/PageHeader";
import { SpeedtestTest } from "@/features/network/SpeedtestTest";
import { useI18n } from "@/hooks/useI18n";

export function Speedtest() {
  const { t } = useI18n();
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="shrink-0">
        <PageHeader
          title={t("speedtest.title")}
          description={t("speedtest.description")}
        />
      </div>
      <SpeedtestTest />
    </div>
  );
}
