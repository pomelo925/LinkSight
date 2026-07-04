import { PageHeader } from "@/components/layout/PageHeader";
import { ScanTest } from "@/features/network/ScanTest";

export function Scan() {
  return (
    <div>
      <PageHeader
        title="LAN Scan"
        description="Discover devices on the local network (nmap, ping-sweep fallback)."
      />
      <ScanTest />
    </div>
  );
}
