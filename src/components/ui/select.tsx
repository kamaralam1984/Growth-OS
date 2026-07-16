import * as React from "react";

import { cn } from "@/lib/utils";

export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;

/**
 * Native <select>, styled to match Input exactly. Kept deliberately plain
 * (no custom listbox/dropdown) — the option lists it's used with are short
 * enough that a native picker is the honest, accessible choice.
 *
 * `bg-transparent` only styles the CLOSED control — browsers render the open
 * option list as a separate native popup that does not inherit a transparent
 * background, so on a dark theme it falls back to each browser's own light
 * popup background while `text-foreground` (light, for the dark theme) keeps
 * cascading into the `<option>`s — light text on a light popup, invisible.
 * `<option>` background/color are two of the few native-control styles
 * browsers do honor, so setting them explicitly (not just relying on
 * inheritance) fixes the popup itself, not just the closed control. Uses a
 * descendant selector (not a direct-child one) so options nested inside an
 * `<optgroup>` (see dashboard-switcher.tsx) are covered too, and styles
 * `<optgroup>` itself for the same reason.
 */
function Select({ className, children, ...props }: SelectProps) {
  return (
    <select
      data-slot="select"
      className={cn(
        "h-11 w-full rounded-lg border border-input bg-transparent px-3.5 text-sm text-foreground transition-colors duration-150 ease-[var(--ease-out-quad)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_option]:bg-popover [&_option]:text-popover-foreground [&_optgroup]:bg-popover [&_optgroup]:text-popover-foreground",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export { Select };
