import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { Plus, Server } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useI18n } from "@/hooks/useI18n";
import { useHostStore } from "@/store/useHostStore";
import type { HostRecord } from "@/lib/types";

/** Dropdown listing saved hosts; anchored below a peer circle. */
export function HostPicker({
  onPick,
  onClose,
}: {
  onPick: (host: HostRecord) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const hosts = useHostStore((s) => s.hosts);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return (
    <div ref={ref} className="absolute left-1/2 top-full z-20 mt-2 w-64 -translate-x-1/2">
      <Card className="shadow-lg">
        <CardContent className="p-2">
          {hosts.length === 0 ? (
            <div className="space-y-2 p-3 text-center text-sm text-muted-foreground">
              <p>{t("hostPicker.empty")}</p>
              <Button asChild size="sm" variant="secondary">
                <Link to="/hosts">
                  <Plus className="h-4 w-4" />
                  {t("hostPicker.addHost")}
                </Link>
              </Button>
            </div>
          ) : (
            <div className="max-h-64 overflow-y-auto">
              {hosts.map((h) => (
                <button
                  key={h.id}
                  type="button"
                  onClick={() => onPick(h)}
                  className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm hover:bg-accent"
                >
                  <Server className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{h.alias}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {h.username}@{h.ip}
                      {h.port != null && h.port > 0 ? `:${h.port}` : ""}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
