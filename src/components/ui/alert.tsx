import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const alertVariants = cva(
  "relative w-full rounded-2xl border px-4 py-3 text-sm grid grid-cols-[0_1fr] items-start gap-y-1 has-[>svg]:grid-cols-[1.25rem_1fr] has-[>svg]:gap-x-3 [&>svg]:size-4 [&>svg]:translate-y-0.5 [&>svg]:text-current",
  {
    variants: {
      variant: {
        default: "border-border bg-muted text-foreground",
        success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 [&>svg]:text-emerald-600",
        warning: "border-amber-500/30 bg-amber-500/10 text-amber-600 [&>svg]:text-amber-600",
        destructive: "border-destructive/30 bg-destructive/10 text-destructive [&>svg]:text-destructive",
        info: "border-blue-500/30 bg-blue-500/10 text-blue-600 [&>svg]:text-blue-600",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface AlertProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof alertVariants> {}

function Alert({ className, variant, ...props }: AlertProps) {
  return (
    <div
      data-slot="alert"
      role="alert"
      className={cn(alertVariants({ variant, className }))}
      {...props}
    />
  );
}

function AlertTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    // eslint-disable-next-line jsx-a11y/heading-has-content -- children come via {...props} at every real call site; the rule can't see that statically on a polymorphic wrapper.
    <h5
      data-slot="alert-title"
      className={cn("col-start-2 text-sm font-medium leading-tight", className)}
      {...props}
    />
  );
}

function AlertDescription({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="alert-description"
      className={cn("col-start-2 text-sm opacity-90 [&_p]:leading-relaxed", className)}
      {...props}
    />
  );
}

export { Alert, AlertTitle, AlertDescription, alertVariants };
