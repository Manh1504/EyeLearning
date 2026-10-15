import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

const alertVariants = cva(
  "flex items-start gap-3 rounded-lg border px-4 py-3 text-sm",
  {
    variants: {
      variant: {
        info: "border-info/25 bg-info/8 text-foreground",
        success: "border-success/25 bg-success/8 text-foreground",
        warning: "border-warning/30 bg-warning/10 text-foreground",
        destructive: "border-destructive/25 bg-destructive/8 text-foreground",
      },
    },
    defaultVariants: { variant: "info" },
  },
);

const ICON_FOR = {
  info: "ri-information-line",
  success: "ri-checkbox-circle-fill",
  warning: "ri-error-warning-line",
  destructive: "ri-error-warning-line",
} as const;

export interface AlertProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof alertVariants> {
  title?: string;
}

export function Alert({ className, variant = "info", title, children, ...props }: AlertProps) {
  const v = variant ?? "info";
  const iconColor = {
    info: "text-info",
    success: "text-success",
    warning: "text-warning",
    destructive: "text-destructive",
  }[v];

  return (
    <div role="alert" className={cn(alertVariants({ variant }), className)} {...props}>
      <Icon name={ICON_FOR[v]} className={cn("mt-0.5 size-4 shrink-0", iconColor)} />
      <div className="flex-1 space-y-0.5">
        {title && <p className="font-medium text-foreground">{title}</p>}
        {children && <div className="text-muted-foreground">{children}</div>}
      </div>
    </div>
  );
}
