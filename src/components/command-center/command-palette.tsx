"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { Command } from "cmdk";
import { Search, Sparkles, ArrowLeft } from "lucide-react";

import { cn } from "@/lib/utils";
import { useT } from "@/components/providers/translation-provider";
import { getNavigationCommands, type CommandDefinition } from "@/lib/nav-commands";
import type { SearchResult } from "@/lib/search";

import { useCommandSearch } from "./use-command-search";
import { runAICommandBar } from "./actions";
import { AIAnswerPanel, type AIAnswerState } from "./ai-answer-panel";
import {
  NAV_COMMAND_ICONS,
  RESULT_KIND_ICONS,
  RESULT_KIND_LABELS,
  matchesNavQuery,
  groupResultsByKind,
} from "./result-kind";

const NAV_COMMANDS = getNavigationCommands();

/**
 * Ctrl+K / Cmd+K command palette: navigation commands, live global search
 * (grouped by kind), and an "Ask AI" fallback when nothing matches.
 *
 * Keyboard notes:
 *   - The global listener below checks for the Cmd/Ctrl modifier alongside
 *     "k", so a bare "k" keypress inside any other input/textarea never
 *     triggers it — only the actual Cmd+K/Ctrl+K chord does, which is the
 *     same global shortcut every reference app (Linear, Notion, GitHub)
 *     binds regardless of what currently has focus.
 *   - Escape-to-close and focus trapping come from Radix Dialog, which
 *     cmdk's <Command.Dialog> wraps internally — not reimplemented here.
 *   - shouldFilter is turned off: navigation commands are filtered manually
 *     (matchesNavQuery) and search results already arrive pre-filtered from
 *     the server, so cmdk's own fuzzy-filter/sort would only fight both.
 */
export function CommandPalette() {
  const router = useRouter();
  const t = useT();
  const { resolvedTheme, setTheme } = useTheme();
  const { query, setQuery, results, isSearching, error: searchError } = useCommandSearch();

  const [open, setOpen] = React.useState(false);
  const [aiState, setAiState] = React.useState<AIAnswerState | null>(null);
  const [aiCommandText, setAiCommandText] = React.useState("");
  const [, startAiTransition] = React.useTransition();

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  // Lets other Command Center UI (e.g. the Quick Actions floating cluster's
  // "Ask AI / Search" button) open this same palette instance without
  // needing a ref or a second copy of its state — see
  // src/components/command-center/quick-actions.tsx's openCommandPalette().
  React.useEffect(() => {
    function onExternalOpen() {
      setOpen(true);
    }
    window.addEventListener("growthos:open-command-palette", onExternalOpen);
    return () => window.removeEventListener("growthos:open-command-palette", onExternalOpen);
  }, []);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setQuery("");
      setAiState(null);
    }
  }

  function handleQueryChange(value: string) {
    setQuery(value);
    if (aiState) setAiState(null);
  }

  function handleSelectNav(command: CommandDefinition) {
    if (command.action === "toggle-theme") {
      setTheme(resolvedTheme === "dark" ? "light" : "dark");
    } else if (command.href) {
      router.push(command.href);
    }
    handleOpenChange(false);
  }

  function handleSelectResult(result: SearchResult) {
    router.push(result.href);
    handleOpenChange(false);
  }

  function handleAskAI() {
    const commandText = query.trim();
    if (!commandText) return;
    setAiCommandText(commandText);
    setAiState({ status: "loading" });
    startAiTransition(async () => {
      const response = await runAICommandBar(commandText);
      if (response.ok) {
        setAiState({ status: "result", content: response.content ?? "" });
      } else {
        setAiState({ status: "error", message: response.error ?? "Something went wrong.", kind: response.errorKind });
      }
    });
  }

  const filteredNav = NAV_COMMANDS.filter((command) => matchesNavQuery(command.label, command.keywords, query));
  const groupedResults = groupResultsByKind(results);
  const trimmedQuery = query.trim();
  const hasAnyMatch = filteredNav.length > 0 || groupedResults.length > 0;
  const showAskAI = trimmedQuery.length >= 2 && !isSearching && !hasAnyMatch;

  return (
    <Command.Dialog
      open={open}
      onOpenChange={handleOpenChange}
      label="Command palette"
      shouldFilter={false}
      loop
      overlayClassName="fixed inset-0 z-[100] bg-background/70 backdrop-blur-sm"
      contentClassName="fixed left-1/2 top-24 z-[101] w-full max-w-xl -translate-x-1/2 overflow-hidden rounded-2xl glass-panel-strong shadow-card"
    >
      <div className="flex items-center gap-2.5 border-b border-border px-4">
        <Search className="size-4 shrink-0 text-muted-foreground" />
        <Command.Input
          value={query}
          onValueChange={handleQueryChange}
          placeholder={t("palette.placeholder")}
          className="h-12 w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
        />
        <kbd className="hidden shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground sm:inline-block">
          Esc
        </kbd>
      </div>

      <Command.List className="max-h-[26rem] overflow-y-auto p-2">
        {aiState ? (
          <div className="p-2">
            <AIAnswerPanel state={aiState} commandText={aiCommandText} />
            <button
              type="button"
              onClick={() => setAiState(null)}
              className="mt-3 inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="size-3" />
              Back to search
            </button>
          </div>
        ) : (
          <>
            <Command.Empty className="p-6 text-center text-sm text-muted-foreground">
              {isSearching ? "Searching…" : searchError ?? t("palette.noResults")}
            </Command.Empty>

            {filteredNav.length > 0 && (
              <Command.Group
                heading="Navigation"
                className="px-2 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground [&_[cmdk-group-items]]:mt-1"
              >
                {filteredNav.map((command) => {
                  const Icon = NAV_COMMAND_ICONS[command.id] ?? Search;
                  return (
                    <Command.Item
                      key={command.id}
                      value={command.id}
                      onSelect={() => handleSelectNav(command)}
                      className={cn(
                        "flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-sm text-foreground",
                        "data-[selected=true]:bg-primary/10 data-[selected=true]:text-primary",
                      )}
                    >
                      <Icon className="size-4 shrink-0" />
                      {command.label}
                    </Command.Item>
                  );
                })}
              </Command.Group>
            )}

            {groupedResults.map(([kind, items]) => {
              const Icon = RESULT_KIND_ICONS[kind];
              return (
                <Command.Group
                  key={kind}
                  heading={RESULT_KIND_LABELS[kind]}
                  className="px-2 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground [&_[cmdk-group-items]]:mt-1"
                >
                  {items.map((result) => (
                    <Command.Item
                      key={`${kind}-${result.id}`}
                      value={`${kind}-${result.id}`}
                      onSelect={() => handleSelectResult(result)}
                      className={cn(
                        "flex cursor-pointer items-start gap-2.5 rounded-lg px-2.5 py-2.5 text-sm text-foreground",
                        "data-[selected=true]:bg-primary/10 data-[selected=true]:text-primary",
                      )}
                    >
                      <Icon className="mt-0.5 size-4 shrink-0" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{result.title}</span>
                        {result.subtitle && (
                          <span className="block truncate text-xs text-muted-foreground">{result.subtitle}</span>
                        )}
                      </span>
                    </Command.Item>
                  ))}
                </Command.Group>
              );
            })}

            {showAskAI && (
              <Command.Group
                heading={t("palette.askAi")}
                className="px-2 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground [&_[cmdk-group-items]]:mt-1"
              >
                <Command.Item
                  value={`ask-ai-${trimmedQuery}`}
                  onSelect={handleAskAI}
                  className={cn(
                    "flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-sm text-foreground",
                    "data-[selected=true]:bg-primary/10 data-[selected=true]:text-primary",
                  )}
                >
                  <Sparkles className="size-4 shrink-0" />
                  {t("palette.askAi")}: &ldquo;{trimmedQuery}&rdquo;
                </Command.Item>
              </Command.Group>
            )}
          </>
        )}
      </Command.List>
    </Command.Dialog>
  );
}
