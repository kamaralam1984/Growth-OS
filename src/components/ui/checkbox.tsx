import * as React from "react";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

function Checkbox({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <span className="relative inline-flex size-5 shrink-0">
      <input
        type="checkbox"
        data-slot="checkbox"
        className={cn(
          "peer size-5 shrink-0 appearance-none rounded-md border border-input bg-transparent transition-colors duration-150 ease-[var(--ease-out-quad)] checked:border-primary checked:bg-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
          className,
        )}
        {...props}
      />
      <Check className="pointer-events-none absolute inset-0 m-auto size-3.5 text-primary-foreground opacity-0 peer-checked:opacity-100" strokeWidth={3} />
    </span>
  );
}

export { Checkbox };
