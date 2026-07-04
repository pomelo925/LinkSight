import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";

export function Scan() {
  return (
    <div>
      <PageHeader
        title="LAN Scan"
        description="Discover devices on the local network (nmap wrapper)."
      />
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          LAN discovery is scaffolded in the backend
          (<code>src-tauri/src/network/scan.rs</code>) and will surface here.
        </CardContent>
      </Card>
    </div>
  );
}
