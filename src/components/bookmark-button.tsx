"use client";

import * as React from "react";
import { Bookmark, Star, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { toggleBookmark } from "@/lib/bookmarks";
import type { BookmarkableType, BookmarkKind } from "@/generated/prisma/client";

export interface BookmarkButtonProps {
  targetType: BookmarkableType;
  targetId: string;
  /** BOOKMARK renders a bookmark icon, FAVORITE renders a star. Defaults to BOOKMARK. */
  kind?: BookmarkKind;
  /** Known initial state (e.g. resolved server-side alongside the item it decorates) — avoids a flash of the wrong icon. Defaults to false. */
  initialBookmarked?: boolean;
  size?: "sm" | "md";
  className?: string;
  onToggled?: (bookmarked: boolean) => void;
}

/**
 * Small, reusable star/bookmark toggle backed by the real Bookmark model
 * (src/lib/bookmarks.ts's toggleBookmark Server Action) — any page can drop
 * this in given a BookmarkableType + targetId. Wired into the Enterprise
 * Search result cards (src/app/dashboard/search) at minimum; Knowledge Base
 * articles, Deals, and Projects pages could adopt it the same way since
 * their BookmarkableType values already exist.
 */
export function BookmarkButton({
  targetType,
  targetId,
  kind = "BOOKMARK",
  initialBookmarked = false,
  size = "md",
  className,
  onToggled,
}: BookmarkButtonProps) {
  const [bookmarked, setBookmarked] = React.useState(initialBookmarked);
  const [isPending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  const Icon = kind === "FAVORITE" ? Star : Bookmark;
  const label = bookmarked
    ? kind === "FAVORITE"
      ? "Remove from favorites"
      : "Remove bookmark"
    : kind === "FAVORITE"
      ? "Add to favorites"
      : "Add bookmark";

  function handleClick() {
    setError(null);
    const prev = bookmarked;
    setBookmarked(!prev); // optimistic
    startTransition(async () => {
      const result = await toggleBookmark(targetType, targetId, kind);
      if (!result.ok) {
        setBookmarked(prev); // revert
        setError(result.error ?? "Could not update bookmark.");
        return;
      }
      setBookmarked(result.bookmarked);
      onToggled?.(result.bookmarked);
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      aria-pressed={bookmarked}
      aria-label={label}
      title={error ?? label}
      className={cn(
        "inline-flex items-center justify-center rounded-lg transition-colors disabled:opacity-50",
        size === "sm" ? "size-7" : "size-9",
        bookmarked ? "text-primary" : "text-muted-foreground hover:text-foreground",
        className,
      )}
    >
      {isPending ? (
        <Loader2 className={cn("animate-spin", size === "sm" ? "size-3.5" : "size-4")} />
      ) : (
        <Icon className={cn(size === "sm" ? "size-3.5" : "size-4", bookmarked && "fill-current")} />
      )}
    </button>
  );
}
