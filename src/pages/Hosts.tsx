import { useEffect, useState } from "react";
import { Plus, Server, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useHostStore } from "@/store/useHostStore";
import { HostEditor } from "@/features/hosts/HostEditor";
import type { HostRecord } from "@/lib/types";

const EMPTY_HOST: HostRecord = {
  id: "",
  alias: "",
  hostname: null,
  username: "",
  ip: "",
  password: null,
  port: 22,
};

export function Hosts() {
  const hosts = useHostStore((s) => s.hosts);
  const loaded = useHostStore((s) => s.loaded);
  const load = useHostStore((s) => s.load);
  const save = useHostStore((s) => s.save);
  const remove = useHostStore((s) => s.remove);

  const [editing, setEditing] = useState<HostRecord | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    load().catch((err) =>
      setLoadError(err instanceof Error ? err.message : String(err)),
    );
  }, [load]);

  const handleSave = async (host: HostRecord) => {
    await save(host);
    setEditing(null);
  };

  return (
    <div>
      <PageHeader
        title="Hosts"
        description="Saved remote machines for connectivity tests and SSH sessions."
      />

      <div className="flex items-start gap-6">
        <div className="min-w-0 flex-1 space-y-4">
          <Button onClick={() => setEditing({ ...EMPTY_HOST })}>
            <Plus className="h-4 w-4" />
            New Host
          </Button>

          {loadError && (
            <Card>
              <CardContent className="py-4 text-sm text-destructive">
                {loadError}
              </CardContent>
            </Card>
          )}

          {loaded && hosts.length === 0 && !loadError ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                No hosts yet. Add a machine to run connectivity tests against it.
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {hosts.map((h) => (
                <Card
                  key={h.id}
                  className="cursor-pointer transition-colors hover:border-primary/60"
                  onClick={() => setEditing({ ...h })}
                >
                  <CardContent className="flex items-center justify-between gap-3 py-4">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Server className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-medium">{h.alias}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {h.username}@{h.ip}:{h.port}
                          {h.hostname ? ` · ${h.hostname}` : ""}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Delete ${h.alias}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        void remove(h.id);
                        if (editing?.id === h.id) setEditing(null);
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        {editing && (
          <HostEditor
            key={editing.id || "new"}
            host={editing}
            onSave={handleSave}
            onClose={() => setEditing(null)}
          />
        )}
      </div>
    </div>
  );
}
