import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function Bandwidth() {
  return (
    <div>
      <PageHeader
        title="Bandwidth"
        description="iperf3 throughput measurement — Advanced Mode."
      />
      <Card>
        <CardContent className="space-y-3 py-10 text-center text-sm text-muted-foreground">
          <Badge variant="secondary">Advanced Mode · remote required</Badge>
          <p>
            Requires a reachable iperf3 server (or a LinkSight Agent). Backend
            wrapper: <code>src-tauri/src/network/bandwidth.rs</code>.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
