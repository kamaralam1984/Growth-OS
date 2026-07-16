"use client";

import { cn } from "@/lib/utils";

export interface MultiSelectChipsProps {
  options: readonly string[];
  selected: string[];
  onChange: (next: string[]) => void;
  className?: string;
}

/**
 * Toggleable pill grid for a fixed option list (services offered, client
 * types, AI goals). Selected chips resolve to the single rose brand accent —
 * no per-category colors.
 */
export function MultiSelectChips({ options, selected, onChange, className }: MultiSelectChipsProps) {
  function toggle(option: string) {
    onChange(selected.includes(option) ? selected.filter((s) => s !== option) : [...selected, option]);
  }

  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {options.map((option) => {
        const active = selected.includes(option);
        return (
          <button
            key={option}
            type="button"
            onClick={() => toggle(option)}
            aria-pressed={active}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors duration-150 ease-[var(--ease-out-quad)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? "border-primary bg-primary text-primary-foreground shadow-card"
                : "border-border bg-transparent text-foreground hover:bg-accent",
            )}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}
