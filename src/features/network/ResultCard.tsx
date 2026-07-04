import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { NetworkTestResult } from "@/lib/types";
import { formatMs } from "@/lib/utils";

interface MetricProps {
  label: string;
  value: string;
}

function Metric({ label, value }: MetricProps) {
  return (
    <div className="rounded-lg bg-muted/40 p-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}

export function ResultCard({ result }: { result: NetworkTestResult }) {
  const failed = result.status === "failed";
  const { summary } = result;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="capitalize">
              {result.kind} · {result.target}
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              {new Date(result.startedAt).toLocaleString()} ·{" "}
              {result.durationMs} ms
            </p>
          </div>
          <Badge variant={failed ? "destructive" : "success"}>
            {failed ? "Failed" : "Success"}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          {failed ? (
            <p className="text-sm text-destructive">
              {result.error ?? "Unknown error"}
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Metric label="Min RTT" value={formatMs(summary.rttMinMs)} />
              <Metric label="Avg RTT" value={formatMs(summary.rttAvgMs)} />
              <Metric label="Max RTT" value={formatMs(summary.rttMaxMs)} />
              <Metric
                label="Loss"
                value={
                  summary.packetLossPct == null
                    ? "—"
                    : `${summary.packetLossPct.toFixed(0)}%`
                }
              />
            </div>
          )}

          {result.raw && (
            <details className="group">
              <summary className="cursor-pointer select-none text-sm text-muted-foreground hover:text-foreground">
                Raw output
              </summary>
              <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-background p-3 text-xs text-muted-foreground">
                {result.raw}
              </pre>
            </details>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
