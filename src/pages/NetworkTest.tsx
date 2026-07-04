import { PageHeader } from "@/components/layout/PageHeader";
import { PingTest } from "@/features/network/PingTest";

export function NetworkTest() {
  return (
    <div>
      <PageHeader
        title="Network Test"
        description="Basic Mode diagnostics — no remote permissions required."
      />
      <PingTest />
    </div>
  );
}
