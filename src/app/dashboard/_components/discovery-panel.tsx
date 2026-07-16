"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search, CheckSquare, Square, Globe, Mail, Phone, SlidersHorizontal, BookmarkPlus, History, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { AiErrorBanner, type AIErrorKind } from "@/app/board/_components/ai-error-banner";
import { INDUSTRIES } from "@/lib/industries";
import { FILTER_LABELS, type DiscoveryFilters } from "@/lib/validations/discovery";
import { saveSearch } from "@/app/dashboard/_lib/saved-search-actions";
import type { RecentSearchView } from "@/app/dashboard/_lib/saved-search-actions";

export interface DiscoveredCompanyView {
  name: string;
  website?: string;
  industry?: string;
  email?: string;
  phone?: string;
  reason?: string;
}

export interface DiscoveryPanelProps {
  kind: "lead" | "client";
  placeholder: string;
  searchAction: (query: string, filters?: Partial<DiscoveryFilters>) => Promise<{
    ok: boolean;
    error?: string;
    errorKind?: AIErrorKind;
    companies?: DiscoveredCompanyView[];
  }>;
  saveAction: (companies: DiscoveredCompanyView[]) => Promise<{
    ok: boolean;
    error?: string;
    savedCount?: number;
  }>;
  saveLabel: string;
  recentSearches?: RecentSearchView[];
  suggestedSearches?: string[];
}

const TEXT_FILTER_KEYS: Array<keyof DiscoveryFilters> = [
  "country",
  "state",
  "city",
  "companySize",
  "revenue",
  "employees",
  "technology",
  "keywords",
  "language",
  "growthRate",
  "funding",
  "foundedYear",
  "businessType",
  "remoteHybrid",
  "publicPrivate",
];

const EMPTY_FILTERS: Partial<DiscoveryFilters> = {};

export function DiscoveryPanel({
  kind,
  placeholder,
  searchAction,
  saveAction,
  saveLabel,
  recentSearches = [],
  suggestedSearches = [],
}: DiscoveryPanelProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Partial<DiscoveryFilters>>(EMPTY_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [searching, startSearch] = useTransition();
  const [saving, startSave] = useTransition();
  const [savingSearch, startSaveSearch] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<AIErrorKind>(undefined);
  const [results, setResults] = useState<DiscoveredCompanyView[] | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [searchSavedMessage, setSearchSavedMessage] = useState<string | null>(null);

  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  function setFilter(key: keyof DiscoveryFilters, value: string) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  function toggle(index: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function runSearch(q: string, f: Partial<DiscoveryFilters>) {
    setError(null);
    setErrorKind(undefined);
    setSavedMessage(null);
    startSearch(async () => {
      const result = await searchAction(q, f);
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        setErrorKind(result.errorKind);
        setResults(null);
        return;
      }
      const companies = result.companies ?? [];
      setResults(companies);
      setSelected(new Set(companies.map((_, i) => i)));
    });
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    runSearch(query, filters);
  }

  function handleSave() {
    if (!results) return;
    const chosen = results.filter((_, i) => selected.has(i));
    if (chosen.length === 0) return;
    setError(null);
    startSave(async () => {
      const result = await saveAction(chosen);
      if (!result.ok) {
        setError(result.error ?? "Something went wrong saving.");
        return;
      }
      setSavedMessage(`Saved ${result.savedCount ?? chosen.length} ${result.savedCount === 1 ? "company" : "companies"}.`);
      setResults(null);
      setSelected(new Set());
      router.refresh();
    });
  }

  function handleSaveSearch() {
    if (!query.trim()) return;
    const name = window.prompt("Name this saved search:", query.slice(0, 60));
    if (!name) return;
    setSearchSavedMessage(null);
    startSaveSearch(async () => {
      const result = await saveSearch(name, kind, query, filters);
      setSearchSavedMessage(result.ok ? "Search saved." : result.error ?? "Something went wrong.");
      if (result.ok) router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <form onSubmit={handleSearch} className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row">
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={placeholder} className="flex-1" />
          <Button type="submit" disabled={searching || query.trim().length < 3}>
            <Search className="size-4" />
            {searching ? "Searching the web…" : "Search"}
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setFiltersOpen((v) => !v)}
            className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <SlidersHorizontal className="size-3.5" />
            Advanced filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
          </button>
          <button
            type="button"
            onClick={handleSaveSearch}
            disabled={savingSearch || query.trim().length < 3}
            className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            <BookmarkPlus className="size-3.5" />
            {savingSearch ? "Saving…" : "Save this search"}
          </button>
          {searchSavedMessage && <span className="text-xs text-primary">{searchSavedMessage}</span>}
        </div>

        {filtersOpen && (
          <Card glass>
            <CardContent className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground">{FILTER_LABELS.industry}</label>
                <Select value={filters.industry ?? ""} onChange={(e) => setFilter("industry", e.target.value)}>
                  <option value="">Any</option>
                  {INDUSTRIES.map((i) => (
                    <option key={i} value={i}>
                      {i}
                    </option>
                  ))}
                </Select>
              </div>
              {TEXT_FILTER_KEYS.map((key) => (
                <div key={key} className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-muted-foreground">{FILTER_LABELS[key]}</label>
                  <Input
                    value={filters[key] ?? ""}
                    onChange={(e) => setFilter(key, e.target.value)}
                    placeholder={FILTER_LABELS[key]}
                    className="h-9 text-sm"
                  />
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </form>

      {suggestedSearches.length > 0 && results === null && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Sparkles className="size-3.5 text-primary" /> Suggested:
          {suggestedSearches.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => {
                setQuery(q);
                runSearch(q, filters);
              }}
              className="rounded-full border border-primary/20 bg-primary/5 px-2.5 py-1 text-primary hover:bg-primary/10"
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {recentSearches.length > 0 && results === null && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <History className="size-3.5" /> Recent:
          {recentSearches.slice(0, 6).map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => {
                setQuery(r.query);
                runSearch(r.query, filters);
              }}
              className="rounded-full border border-border px-2.5 py-1 hover:bg-accent hover:text-foreground"
            >
              {r.query}
            </button>
          ))}
        </div>
      )}

      {error && <AiErrorBanner error={error} kind={errorKind} />}
      {savedMessage && <p className="text-sm text-primary">{savedMessage}</p>}

      {results !== null && (
        <div className="flex flex-col gap-3">
          {results.length === 0 ? (
            <Card glass>
              <CardContent className="p-8 text-center text-sm text-muted-foreground">
                No real companies came up for that search. Try a broader or more specific query, or fewer filters.
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="flex flex-col gap-2">
                {results.map((company, index) => {
                  const isSelected = selected.has(index);
                  return (
                    <Card key={`${company.name}-${index}`} glass className={isSelected ? "border-primary/40" : ""}>
                      <CardContent className="flex items-start gap-3 p-4">
                        <button
                          type="button"
                          onClick={() => toggle(index)}
                          aria-label={isSelected ? "Deselect" : "Select"}
                          className="mt-0.5 shrink-0 text-primary"
                        >
                          {isSelected ? <CheckSquare className="size-5" /> : <Square className="size-5 text-muted-foreground" />}
                        </button>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-foreground">{company.name}</p>
                          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                            {company.industry && <span>{company.industry}</span>}
                            {company.website && (
                              <span className="flex items-center gap-1">
                                <Globe className="size-3" /> {company.website}
                              </span>
                            )}
                            {company.email && (
                              <span className="flex items-center gap-1">
                                <Mail className="size-3" /> {company.email}
                              </span>
                            )}
                            {company.phone && (
                              <span className="flex items-center gap-1">
                                <Phone className="size-3" /> {company.phone}
                              </span>
                            )}
                          </div>
                          {company.reason && (
                            <p className="mt-1.5 text-sm text-muted-foreground">{company.reason}</p>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
              <div>
                <Button onClick={handleSave} disabled={saving || selected.size === 0}>
                  {saving ? "Saving…" : `${saveLabel} (${selected.size})`}
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
