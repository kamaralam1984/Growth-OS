"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Search, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { EASES } from "@/animations";
import { useT } from "@/components/providers/translation-provider";
import type { SearchResult } from "@/lib/search";

import { useCommandSearch } from "./use-command-search";
import { SearchResultsList } from "./search-results-list";

/**
 * Standalone "Search" trigger + results dropdown for the top nav, for
 * users who click a button instead of pressing Cmd/Ctrl+K. Shares its
 * query/debounce/fetch logic with the Command Palette via useCommandSearch
 * (both wrap the same searchCommandCenter Server Action) — only the
 * trigger chrome and result presentation differ.
 */
export function GlobalSearch({ className }: { className?: string }) {
  const router = useRouter();
  const t = useT();
  const { query, setQuery, results, isSearching, error } = useCommandSearch();
  const [open, setOpen] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) setQuery("");
  }

  React.useEffect(() => {
    if (open) {
      // Defer to next tick so the panel has mounted before we focus it.
      const id = requestAnimationFrame(() => inputRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") handleOpenChange(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function handleSelectResult(result: SearchResult) {
    router.push(result.href);
    handleOpenChange(false);
  }

  const trimmed = query.trim();

  return (
    <div className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => handleOpenChange(!open)}
        aria-expanded={open}
        aria-label="Search"
        className="flex h-9 items-center gap-2 rounded-lg border border-border bg-transparent px-3 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <Search className="size-4" />
        <span className="hidden sm:inline">Search</span>
        <kbd className="hidden rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground sm:inline-block">
          ⌘K
        </kbd>
      </button>

      <AnimatePresence>
        {open && (
          <>
            <button
              type="button"
              aria-label="Close search"
              className="fixed inset-0 z-40 cursor-default"
              onClick={() => handleOpenChange(false)}
              tabIndex={-1}
            />
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.98 }}
              transition={{ duration: 0.18, ease: EASES.outExpo }}
              className="absolute right-0 z-50 mt-2 w-[24rem] max-w-[90vw] overflow-hidden rounded-2xl border border-border bg-card shadow-card"
            >
              <div className="flex items-center gap-2.5 border-b border-border px-4">
                <Search className="size-4 shrink-0 text-muted-foreground" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={t("topnav.search")}
                  className="h-12 w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
                />
                {isSearching && <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />}
              </div>

              <div className="max-h-96 overflow-y-auto p-2">
                {trimmed.length < 2 ? (
                  <p className="p-6 text-center text-sm text-muted-foreground">
                    Type at least 2 characters to search.
                  </p>
                ) : error ? (
                  <p className="p-6 text-center text-sm text-muted-foreground">{error}</p>
                ) : results.length === 0 ? (
                  <p className="p-6 text-center text-sm text-muted-foreground">
                    {isSearching ? "Searching…" : "No results found."}
                  </p>
                ) : (
                  <SearchResultsList results={results} onSelect={handleSelectResult} />
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
