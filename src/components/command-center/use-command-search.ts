"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import type { SearchResult } from "@/lib/search";
import { searchCommandCenter } from "./actions";

const DEBOUNCE_MS = 250;
const MIN_QUERY_LENGTH = 2;

export interface UseCommandSearchResult {
  query: string;
  setQuery: (query: string) => void;
  results: SearchResult[];
  /** True while a debounced search request is pending or in flight. */
  isSearching: boolean;
  error: string | null;
}

/**
 * Debounced global-search hook shared by the Command Palette's live search
 * section and the standalone Global Search component — the one place the
 * query-debounce-race logic lives, per the brief's "don't duplicate the
 * query logic" instruction.
 *
 * Debounces ~250ms, then calls the searchCommandCenter Server Action (which
 * wraps src/lib/search.ts's globalSearch). A monotonically increasing
 * request id guards against a slower earlier request clobbering a faster
 * later one if responses arrive out of order.
 */
export function useCommandSearch(): UseCommandSearchResult {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isDebouncing, setIsDebouncing] = useState(false);
  const requestIdRef = useRef(0);

  useEffect(() => {
    const trimmed = query.trim();

    if (trimmed.length < MIN_QUERY_LENGTH) {
      requestIdRef.current += 1; // invalidate any in-flight request
      // Deliberate synchronous reset (not a mirrored derived value): the
      // query just dropped below the searchable length, so any stale
      // results/error from a previous longer query must clear immediately
      // rather than lingering until the next debounced fetch resolves.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsDebouncing(false);
      setResults([]);
      setError(null);
      return;
    }

    setIsDebouncing(true);
    const timer = setTimeout(() => {
      const requestId = ++requestIdRef.current;
      startTransition(async () => {
        const response = await searchCommandCenter(trimmed);
        if (requestId !== requestIdRef.current) return; // superseded by a newer query
        setIsDebouncing(false);
        if (!response.ok) {
          setError(response.error ?? "Search failed.");
          setResults([]);
          return;
        }
        setError(null);
        setResults(response.results);
      });
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [query]);

  return { query, setQuery, results, isSearching: isDebouncing || isPending, error };
}
