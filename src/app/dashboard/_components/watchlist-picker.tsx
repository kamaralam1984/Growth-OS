"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Bookmark, BookmarkCheck, ChevronDown } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

import { cn } from "@/lib/utils";
import { EASES } from "@/animations";
import { addCompanyToWatchlist, removeCompanyFromWatchlist } from "@/app/dashboard/watchlists/actions";

export interface WatchlistPickerProps {
  companyId: string;
  watchlists: Array<{ id: string; name: string }>;
  memberOf: string[];
}

/** Add/remove a company from one or more watchlists — same custom-dropdown pattern as DashboardSwitcher. */
export function WatchlistPicker({ companyId, watchlists, memberOf }: WatchlistPickerProps) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const [member, setMember] = React.useState(new Set(memberOf));

  function toggle(watchlistId: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const isMember = member.has(watchlistId);
    setMember((prev) => {
      const next = new Set(prev);
      if (isMember) next.delete(watchlistId);
      else next.add(watchlistId);
      return next;
    });
    startTransition(async () => {
      const result = isMember
        ? await removeCompanyFromWatchlist(watchlistId, companyId)
        : await addCompanyToWatchlist(watchlistId, companyId);
      if (result.ok) router.refresh();
    });
  }

  if (watchlists.length === 0) return null;

  return (
    <div className="relative" onClick={(e) => e.preventDefault()}>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        disabled={pending}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
          member.size > 0 ? "border-primary/30 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground",
        )}
      >
        {member.size > 0 ? <BookmarkCheck className="size-3.5" /> : <Bookmark className="size-3.5" />}
        Watchlist{member.size > 0 ? ` (${member.size})` : ""}
        <ChevronDown className="size-3" />
      </button>

      <AnimatePresence>
        {open && (
          <>
            <button
              type="button"
              aria-label="Close watchlist picker"
              className="fixed inset-0 z-40 cursor-default"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setOpen(false);
              }}
              tabIndex={-1}
            />
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.98 }}
              transition={{ duration: 0.15, ease: EASES.outExpo }}
              className="absolute right-0 z-50 mt-1 w-56 overflow-hidden rounded-2xl border border-border bg-card p-1.5 shadow-card"
            >
              {watchlists.map((wl) => (
                <button
                  key={wl.id}
                  type="button"
                  onClick={(e) => toggle(wl.id, e)}
                  className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-accent"
                >
                  <span className="truncate">{wl.name}</span>
                  {member.has(wl.id) && <BookmarkCheck className="size-3.5 shrink-0 text-primary" />}
                </button>
              ))}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
