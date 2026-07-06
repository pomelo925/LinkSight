import { PageHeader } from "@/components/layout/PageHeader";
import { SpeedtestTest } from "@/features/network/SpeedtestTest";
import { useI18n } from "@/hooks/useI18n";

export function Speedtest() {
  const { t } = useI18n();
  return (
    <div>
      <PageHeader
        title={t("speedtest.title")}
        description={t("speedtest.description")}
      />
      <SpeedtestTest />
    </div>
  );
}
