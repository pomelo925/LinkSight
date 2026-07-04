import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function Settings() {
  return (
    <div>
      <PageHeader
        title="Settings"
        description="Application preferences and diagnostics configuration."
      />
      <Card>
        <CardHeader>
          <CardTitle>About</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm text-muted-foreground">
          <p>LinkSight v0.1.0</p>
          <p>Linux-first network diagnostics &amp; connectivity analysis.</p>
          <p>Built with Tauri v2, React, and a Tokio-async Rust core.</p>
        </CardContent>
      </Card>
    </div>
  );
}
