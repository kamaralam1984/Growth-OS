"use client";

import type { SearchResult } from "@/lib/search";
import { RESULT_KIND_ICONS, RESULT_KIND_LABELS, groupResultsByKind } from "./result-kind";

/**
 * Plain (non-cmdk) grouped results renderer for the standalone Global
 * Search dropdown. The Command Palette renders its own cmdk-flavored
 * markup (Command.Group/Command.Item are required there for keyboard
 * navigation), so this isn't shared with it directly — but both consume
 * the same useCommandSearch hook + groupResultsByKind/RESULT_KIND_* maps,
 * which is the query/data logic the brief asks not to duplicate.
 */
export function SearchResultsList({
  results,
  onSelect,
}: {
  results: SearchResult[];
  onSelect: (result: SearchResult) => void;
}) {
  const grouped = groupResultsByKind(results);
  if (grouped.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      {grouped.map(([kind, items]) => {
        const Icon = RESULT_KIND_ICONS[kind];
        return (
          <div key={kind}>
            <p className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {RESULT_KIND_LABELS[kind]}
            </p>
            <ul className="flex flex-col gap-0.5">
              {items.map((result) => (
                <li key={`${kind}-${result.id}`}>
                  <button
                    type="button"
                    onClick={() => onSelect(result)}
                    className="flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-foreground transition-colors hover:bg-accent"
                  >
                    <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{result.title}</span>
                      {result.subtitle && (
                        <span className="block truncate text-xs text-muted-foreground">{result.subtitle}</span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
