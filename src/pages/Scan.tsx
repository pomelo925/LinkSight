import { PageHeader } from "@/components/layout/PageHeader";
import { ScanTest } from "@/features/network/ScanTest";
import { useI18n } from "@/hooks/useI18n";

export function Scan() {
  const { t } = useI18n();
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="shrink-0">
        <PageHeader
          title={t("scan.title")}
          description={t("scan.description")}
        />
      </div>
      <ScanTest />
    </div>
  );
}
