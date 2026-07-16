"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { deleteWatchlist, removeCompanyFromWatchlist } from "../actions";

export function DeleteWatchlistButton({ watchlistId, watchlistName }: { watchlistId: string; watchlistName: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    if (!confirm(`Delete watchlist "${watchlistName}"? Companies themselves won't be deleted.`)) return;
    startTransition(async () => {
      const result = await deleteWatchlist(watchlistId);
      if (result.ok) router.push("/dashboard/watchlists");
    });
  }

  return (
    <Button variant="ghost" size="sm" onClick={handleDelete} disabled={pending}>
      <Trash2 className="size-4" />
      {pending ? "Deleting…" : "Delete watchlist"}
    </Button>
  );
}

export function RemoveFromWatchlistButton({ watchlistId, companyId }: { watchlistId: string; companyId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleRemove(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    startTransition(async () => {
      await removeCompanyFromWatchlist(watchlistId, companyId);
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={handleRemove}
      disabled={pending}
      aria-label="Remove from watchlist"
      className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
    >
      <X className="size-3.5" />
    </button>
  );
}
