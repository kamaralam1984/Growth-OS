"use client";

import * as React from "react";
import Link from "next/link";
import { Search, Sparkles, BookOpen, FileStack, Bot, Loader2, ExternalLink, History } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { BookmarkButton } from "@/components/bookmark-button";
import { cn } from "@/lib/utils";
import { runKnowledgeSearch, askAIAction, type KnowledgeCardResult, type AskAIActionResult } from "../actions";
import type { EmbeddingSourceType } from "@/generated/prisma/client";

const SOURCE_TYPE_OPTIONS: Array<{ value: EmbeddingSourceType; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { value: "KNOWLEDGE_ARTICLE", label: "Knowledge articles", icon: BookOpen },
  { value: "DOCUMENT_CHUNK", label: "Documents", icon: FileStack },
  { value: "AGENT_MEMORY", label: "AI memory", icon: Bot },
];

const SOURCE_TYPE_ICONS: Record<EmbeddingSourceType, React.ComponentType<{ className?: string }>> = {
  KNOWLEDGE_ARTICLE: BookOpen,
  DOCUMENT_CHUNK: FileStack,
  AGENT_MEMORY: Bot,
};

export interface RecentSearchEntry {
  id: string;
  query: string;
  resultCount: number;
  isSemanticSearch: boolean;
  createdAt: string;
}

export interface AuthorOption {
  id: string;
  label: string;
}

export function SearchPanel({
  authors,
  recentSearches,
}: {
  authors: AuthorOption[];
  recentSearches: RecentSearchEntry[];
}) {
  const [mode, setMode] = React.useState<"search" | "ask-ai">("search");
  const [query, setQuery] = React.useState("");
  const [selectedTypes, setSelectedTypes] = React.useState<Set<EmbeddingSourceType>>(new Set());
  const [dateFrom, setDateFrom] = React.useState("");
  const [dateTo, setDateTo] = React.useState("");
  const [authorId, setAuthorId] = React.useState("");

  const [results, setResults] = React.useState<KnowledgeCardResult[] | null>(null);
  const [searchError, setSearchError] = React.useState<string | null>(null);
  const [isSearching, startSearchTransition] = React.useTransition();

  const [aiResult, setAiResult] = React.useState<AskAIActionResult | null>(null);
  const [isAsking, startAskTransition] = React.useTransition();

  function toggleType(type: EmbeddingSourceType) {
    setSelectedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  function runSearch(q: string) {
    const trimmed = q.trim();
    if (trimmed.length < 2) {
      setSearchError("Type at least 2 characters to search.");
      setResults([]);
      return;
    }
    setSearchError(null);
    startSearchTransition(async () => {
      const response = await runKnowledgeSearch({
        query: trimmed,
        sourceTypes: selectedTypes.size > 0 ? Array.from(selectedTypes) : undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        authorId: authorId || undefined,
      });
      if (!response.ok) {
        setSearchError(response.error ?? "Search failed.");
        setResults([]);
        return;
      }
      setResults(response.results);
    });
  }

  function runAskAI(q: string) {
    const trimmed = q.trim();
    if (trimmed.length < 2) return;
    setAiResult(null);
    startAskTransition(async () => {
      const response = await askAIAction(trimmed);
      setAiResult(response);
    });
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (mode === "search") runSearch(query);
    else runAskAI(query);
  }

  return (
    <div className="flex flex-col gap-6">
      <Card glass>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                {mode === "search" ? <Search className="size-4" /> : <Sparkles className="size-4" />}
                {mode === "search" ? "Knowledge Search" : "Ask AI"}
              </CardTitle>
              <CardDescription>
                {mode === "search"
                  ? "Real hybrid semantic/keyword search over Knowledge Base articles, ingested documents, and AI memory."
                  : "Answers are generated only from this org's verified knowledge — never guessed."}
              </CardDescription>
            </div>
            <div className="inline-flex items-center gap-1 rounded-xl border border-border bg-muted/40 p-1">
              <button
                type="button"
                onClick={() => setMode("search")}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                  mode === "search" ? "bg-primary text-primary-foreground shadow-card" : "text-muted-foreground hover:text-foreground",
                )}
              >
                Search
              </button>
              <button
                type="button"
                onClick={() => setMode("ask-ai")}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                  mode === "ask-ai" ? "bg-primary text-primary-foreground shadow-card" : "text-muted-foreground hover:text-foreground",
                )}
              >
                Ask AI
              </button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex items-center gap-2.5 rounded-lg border border-border px-3.5">
              <Search className="size-4 shrink-0 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={mode === "search" ? "Search knowledge, documents, memory…" : "Ask a question about this organization's knowledge…"}
                className="h-12 w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
              />
              <Button type="submit" size="sm" disabled={isSearching || isAsking}>
                {isSearching || isAsking ? <Loader2 className="size-4 animate-spin" /> : mode === "search" ? "Search" : "Ask"}
              </Button>
            </div>

            {mode === "search" && (
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex flex-wrap gap-2">
                  {SOURCE_TYPE_OPTIONS.map(({ value, label, icon: Icon }) => {
                    const active = selectedTypes.has(value);
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => toggleType(value)}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                          active ? "border-primary/20 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground",
                        )}
                      >
                        <Icon className="size-3.5" /> {label}
                      </button>
                    );
                  })}
                </div>

                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  From
                  <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-9 w-36 text-xs" />
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  To
                  <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-9 w-36 text-xs" />
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  Author
                  <Select value={authorId} onChange={(e) => setAuthorId(e.target.value)} className="h-9 w-44 text-xs">
                    <option value="">Any author</option>
                    {authors.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.label}
                      </option>
                    ))}
                  </Select>
                </label>
              </div>
            )}
          </form>

          {mode === "search" ? (
            <SearchResults results={results} error={searchError} isSearching={isSearching} />
          ) : (
            <AskAIAnswer result={aiResult} isAsking={isAsking} />
          )}
        </CardContent>
      </Card>

      {recentSearches.length > 0 && (
        <Card glass>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <History className="size-4" /> Recent searches
            </CardTitle>
            <CardDescription>Your last {recentSearches.length} real searches on this page.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {recentSearches.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => {
                  setQuery(entry.query);
                  setMode("search");
                  runSearch(entry.query);
                }}
                className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                title={`${entry.resultCount} result${entry.resultCount === 1 ? "" : "s"} · ${entry.isSemanticSearch ? "semantic" : "keyword"}`}
              >
                {entry.query}
              </button>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function SearchResults({
  results,
  error,
  isSearching,
}: {
  results: KnowledgeCardResult[] | null;
  error: string | null;
  isSearching: boolean;
}) {
  if (isSearching) {
    return <p className="text-sm text-muted-foreground">Searching…</p>;
  }
  if (error) {
    return <p className="text-sm text-muted-foreground">{error}</p>;
  }
  if (results === null) {
    return <p className="text-sm text-muted-foreground">Type a query above and press Search.</p>;
  }
  if (results.length === 0) {
    return <p className="text-sm text-muted-foreground">No results found for this query and filter combination.</p>;
  }

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {results.map((card) => {
        const Icon = SOURCE_TYPE_ICONS[card.sourceType];
        return (
          <Card key={`${card.sourceType}-${card.sourceId}`} className="flex flex-col gap-2 p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <Icon className="size-3.5" /> {card.sourceType.replace(/_/g, " ")}
              </div>
              <div className="flex items-center gap-1.5">
                <Badge variant={card.isSemanticMatch ? "accent" : "outline"}>
                  {Math.round(card.score * 100)}% match
                </Badge>
                {/* DOCUMENT_CHUNK's sourceId is a DocumentChunk id, not an IngestedDocument id — bookmarking would point INGESTED_DOCUMENT at the wrong record, so it's intentionally left unbookmarkable from this card (same as KNOWLEDGE_ARTICLE/AGENT_MEMORY, whose sourceId already matches their real target model 1:1). */}
                {(card.sourceType === "KNOWLEDGE_ARTICLE" || card.sourceType === "AGENT_MEMORY") && (
                  <BookmarkButton
                    targetType={card.sourceType === "KNOWLEDGE_ARTICLE" ? "KNOWLEDGE_ARTICLE" : "AGENT_MEMORY"}
                    targetId={card.sourceId}
                    initialBookmarked={card.isBookmarked}
                    size="sm"
                  />
                )}
              </div>
            </div>
            {card.href ? (
              <Link href={card.href} className="flex items-center gap-1.5 text-sm font-semibold text-foreground hover:text-primary">
                {card.title} <ExternalLink className="size-3.5 shrink-0" />
              </Link>
            ) : (
              <p className="text-sm font-semibold text-foreground">{card.title}</p>
            )}
            <p className="line-clamp-3 text-sm text-muted-foreground">{card.snippet}</p>
            <div className="mt-auto flex items-center justify-between text-xs text-muted-foreground">
              <span>{card.authorLabel ?? "Unknown author"}</span>
              <span>{new Date(card.createdAt).toLocaleDateString()}</span>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function AskAIAnswer({ result, isAsking }: { result: AskAIActionResult | null; isAsking: boolean }) {
  if (isAsking) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Thinking…
      </p>
    );
  }
  if (!result) {
    return <p className="text-sm text-muted-foreground">Ask a question above to get an answer grounded only in this organization&apos;s real knowledge.</p>;
  }
  if (!result.ok) {
    return (
      <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-muted/30 p-4">
        <p className="text-sm font-medium text-foreground">
          {result.errorKind === "not_connected" ? "AI not connected" : result.errorKind === "billing" ? "AI billing issue" : "Something went wrong"}
        </p>
        <p className="text-sm text-muted-foreground">{result.error}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3 rounded-lg border border-border p-4">
        <p className="whitespace-pre-wrap text-sm text-foreground">{result.answer}</p>
        {result.hasVerifiedKnowledge && typeof result.confidenceScore === "number" && (
          <Badge variant="accent" className="shrink-0">
            {Math.round(result.confidenceScore * 100)}% confidence
          </Badge>
        )}
      </div>

      {result.hasVerifiedKnowledge && result.citations && result.citations.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Sources</p>
          <div className="flex flex-col gap-2">
            {result.citations.map((citation, index) => (
              <div key={`${citation.sourceType}-${citation.sourceId}-${index}`} className="rounded-lg border border-border p-3">
                <div className="flex items-center justify-between gap-2">
                  {citation.href ? (
                    <Link href={citation.href} className="flex items-center gap-1.5 text-sm font-medium text-foreground hover:text-primary">
                      {citation.title} <ExternalLink className="size-3.5 shrink-0" />
                    </Link>
                  ) : (
                    <span className="text-sm font-medium text-foreground">{citation.title}</span>
                  )}
                  <Badge variant="outline">{Math.round(citation.relevanceScore * 100)}%</Badge>
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{citation.snippet}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
