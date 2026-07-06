import { useEffect } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface CenterDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  className?: string;
}

/** Fixed center overlay — does not affect surrounding layout height. */
export function CenterDialog({
  open,
  onClose,
  title,
  children,
  className,
}: CenterDialogProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close dialog"
        className="absolute inset-0 bg-black/45"
        onClick={onClose}
      />
      <Card
        className={cn("relative z-10 w-full max-w-md shadow-xl", className)}
      >
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-base">{title}</CardTitle>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Close"
            className="h-8 w-8 rounded-md text-muted-foreground transition-[transform,background-color,color] duration-100 hover:bg-accent hover:text-foreground active:scale-90 active:bg-accent/70"
          >
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </div>
  );
}
