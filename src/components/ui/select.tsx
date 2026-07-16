import * as React from "react";

import { cn } from "@/lib/utils";

export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;

/**
 * Native <select>, styled to match Input exactly. Kept deliberately plain
 * (no custom listbox/dropdown) — the option lists it's used with are short
 * enough that a native picker is the honest, accessible choice.
 */
function Select({ className, children, ...props }: SelectProps) {
  return (
    <select
      data-slot="select"
      className={cn(
        "h-11 w-full rounded-lg border border-input bg-transparent px-3.5 text-sm text-foreground transition-colors duration-150 ease-[var(--ease-out-quad)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export { Select };
