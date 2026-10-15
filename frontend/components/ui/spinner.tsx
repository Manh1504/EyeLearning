import { RiLoader4Line } from "@remixicon/react";
import { cn } from "@/lib/utils";

export function Spinner({ className }: { className?: string }) {
  return <RiLoader4Line className={cn("size-4 animate-spin", className)} aria-hidden />;
}

export function FullPageSpinner({ label = "Đang tải..." }: { label?: string }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-muted-foreground">
      <RiLoader4Line className="size-8 animate-spin text-primary" aria-hidden />
      <p className="text-sm">{label}</p>
    </div>
  );
}
