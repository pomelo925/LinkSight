import { PageHeader } from "@/components/layout/PageHeader";
import { TerminalView } from "@/features/terminal/TerminalView";

export function TerminalPage() {
  return (
    <div>
      <PageHeader
        title="Terminal"
        description="SSH session manager — a Termius-like tabbed terminal."
      />
      <TerminalView />
    </div>
  );
}
