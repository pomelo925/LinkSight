import { Link } from "react-router-dom";
import { Activity, Radar, Gauge, TerminalSquare } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/layout/PageHeader";
import { useTestStore } from "@/store/useTestStore";
import { formatMs } from "@/lib/utils";

const QUICK_ACTIONS = [
  {
    to: "/network",
    title: "Network Test",
    description: "Ping, traceroute & latency analysis",
    icon: Activity,
  },
  {
    to: "/scan",
    title: "LAN Scan",
    description: "Discover devices on the local network",
    icon: Radar,
  },
  {
    to: "/bandwidth",
    title: "Bandwidth",
    description: "iperf3 throughput (advanced mode)",
    icon: Gauge,
  },
  {
    to: "/terminal",
    title: "Terminal",
    description: "SSH session manager",
    icon: TerminalSquare,
  },
];

export function Dashboard() {
  const history = useTestStore((s) => s.history);

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Network diagnostics and connectivity intelligence at a glance."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {QUICK_ACTIONS.map(({ to, title, description, icon: Icon }) => (
          <Link key={to} to={to}>
            <Card className="transition-colors hover:border-primary/60">
              <CardHeader className="flex-row items-center gap-3 space-y-0">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-base">{title}</CardTitle>
                  <CardDescription>{description}</CardDescription>
                </div>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>

      <div className="mt-8">
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
          Recent Tests
        </h2>
        {history.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No tests yet. Run your first network test to see results here.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {history.slice(0, 5).map((r) => (
              <Card key={r.id}>
                <CardContent className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3">
                    <Badge
                      variant={r.status === "failed" ? "destructive" : "success"}
                    >
                      {r.kind}
                    </Badge>
                    <span className="text-sm">{r.target}</span>
                  </div>
                  <span className="text-sm tabular-nums text-muted-foreground">
                    {formatMs(r.summary.rttAvgMs)}
                  </span>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
