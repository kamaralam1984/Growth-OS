"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bookmark, Bell, BellOff, Trash2, RefreshCw } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  runSavedSearch,
  deleteSavedSearch,
  toggleSavedSearchNotify,
  type SavedSearchView,
} from "@/app/dashboard/_lib/saved-search-actions";
import { FILTER_LABELS, type DiscoveryFilters } from "@/lib/validations/discovery";

function summarizeFilters(filters: Partial<DiscoveryFilters>): string {
  const parts = Object.entries(filters)
    .filter(([, v]) => Boolean(v))
    .map(([k, v]) => `${FILTER_LABELS[k as keyof DiscoveryFilters] ?? k}: ${v}`);
  return parts.length > 0 ? parts.join(" · ") : "No filters";
}

export function SavedSearchesPanel({ searches }: { searches: SavedSearchView[] }) {
  const router = useRouter();
  const [runningId, setRunningId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (searches.length === 0) return null;

  function handleRun(id: string) {
    setRunningId(id);
    startTransition(async () => {
      await runSavedSearch(id);
      setRunningId(null);
      router.refresh();
    });
  }

  function handleDelete(id: string) {
    if (!confirm("Delete this saved search?")) return;
    startTransition(async () => {
      await deleteSavedSearch(id);
      router.refresh();
    });
  }

  function handleToggleNotify(id: string, current: boolean) {
    startTransition(async () => {
      await toggleSavedSearchNotify(id, !current);
      router.refresh();
    });
  }

  return (
    <Card glass>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Bookmark className="size-4" /> Saved searches ({searches.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 pt-0">
        {searches.map((search) => (
          <div key={search.id} className="flex flex-col gap-1.5 rounded-lg border border-border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-foreground">{search.name}</p>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleToggleNotify(search.id, search.notifyOnMatch)}
                  disabled={pending}
                  aria-label={search.notifyOnMatch ? "Notifications on" : "Notifications off"}
                >
                  {search.notifyOnMatch ? <Bell className="size-3.5 text-primary" /> : <BellOff className="size-3.5" />}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => handleRun(search.id)} disabled={pending}>
                  <RefreshCw className={runningId === search.id ? "size-3.5 animate-spin" : "size-3.5"} />
                  Run again
                </Button>
                <Button variant="ghost" size="sm" onClick={() => handleDelete(search.id)} disabled={pending}>
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">&ldquo;{search.query}&rdquo; — {summarizeFilters(search.filters)}</p>
            <p className="text-[11px] text-muted-foreground">
              {search.lastRunAt
                ? `Last run ${new Date(search.lastRunAt).toLocaleString()} · ${search.lastResultCount ?? 0} results`
                : "Never run yet"}
            </p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
