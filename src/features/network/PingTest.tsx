import { useState } from "react";
import { AnimatePresence } from "framer-motion";
import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { usePing } from "@/hooks/usePing";
import { useTestStore } from "@/store/useTestStore";
import { StatusIndicator } from "./StatusIndicator";
import { ResultCard } from "./ResultCard";

/**
 * End-to-end example: frontend button → Tauri `run_ping` command → result.
 */
export function PingTest() {
  const [host, setHost] = useState("1.1.1.1");
  const [count, setCount] = useState(4);
  const { execute, status } = usePing();
  const current = useTestStore((s) => s.current);

  const busy = status === "running" || status === "analyzing";

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!host.trim()) return;
    void execute({ host: host.trim(), count });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Ping Test</CardTitle>
          <StatusIndicator status={status} />
        </CardHeader>
        <CardContent>
          <form
            onSubmit={onSubmit}
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
          >
            <div className="flex-1 space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Host / IP
              </label>
              <Input
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder="e.g. 1.1.1.1 or example.com"
                disabled={busy}
              />
            </div>
            <div className="w-full space-y-1.5 sm:w-28">
              <label className="text-xs font-medium text-muted-foreground">
                Count
              </label>
              <Input
                type="number"
                min={1}
                max={50}
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
                disabled={busy}
              />
            </div>
            <Button type="submit" disabled={busy} className="sm:w-32">
              <Play className="h-4 w-4" />
              {busy ? "Running…" : "Run Ping"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <AnimatePresence mode="wait">
        {current && current.kind === "ping" && (
          <ResultCard key={current.id} result={current} />
        )}
      </AnimatePresence>
    </div>
  );
}
