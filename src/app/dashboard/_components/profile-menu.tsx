"use client";

import * as React from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { LogOut, Settings, UserCircle } from "lucide-react";

import { EASES } from "@/animations";
import { signOutAction } from "../actions";

export function ProfileMenu({ name, email }: { name: string | null; email: string | null }) {
  const [open, setOpen] = React.useState(false);
  const initial = (name ?? email ?? "?").trim().charAt(0).toUpperCase();

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Profile menu"
        aria-expanded={open}
        className="flex size-9 items-center justify-center rounded-full border border-border bg-primary/10 text-sm font-semibold text-primary transition-colors hover:bg-primary/15"
      >
        {initial || <UserCircle className="size-4" />}
      </button>

      <AnimatePresence>
        {open && (
          <>
            <button
              type="button"
              aria-label="Close profile menu"
              className="fixed inset-0 z-40 cursor-default"
              onClick={() => setOpen(false)}
              tabIndex={-1}
            />
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.98 }}
              transition={{ duration: 0.18, ease: EASES.outExpo }}
              className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-2xl border border-border bg-card p-1.5 shadow-card"
            >
              <div className="px-3 py-2">
                <p className="truncate text-sm font-medium text-foreground">{name ?? "Your account"}</p>
                {email && <p className="truncate text-xs text-muted-foreground">{email}</p>}
              </div>
              <div className="my-1 h-px bg-border" />
              <Link
                href="/profile"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-foreground transition-colors hover:bg-accent"
              >
                <Settings className="size-4" />
                Profile settings
              </Link>
              <form action={signOutAction}>
                <button
                  type="submit"
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-accent"
                >
                  <LogOut className="size-4" />
                  Sign out
                </button>
              </form>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
