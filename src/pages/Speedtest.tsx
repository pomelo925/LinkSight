import { PageHeader } from "@/components/layout/PageHeader";
import { SpeedtestTest } from "@/features/network/SpeedtestTest";

export function Speedtest() {
  return (
    <div>
      <PageHeader
        title="Speed Test"
        description="Measure internet download, upload and latency — Basic Mode."
      />
      <SpeedtestTest />
    </div>
  );
}
