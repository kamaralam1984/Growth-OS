"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Building2, Check, ChevronsUpDown } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

import { cn } from "@/lib/utils";
import { EASES } from "@/animations";
import { setActiveOrganization } from "../actions";

export interface SwitchableOrg {
  id: string;
  name: string;
}

export function WorkspaceSwitcher({ organizations, activeOrgId }: { organizations: SwitchableOrg[]; activeOrgId: string }) {
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const router = useRouter();

  const active = organizations.find((o) => o.id === activeOrgId) ?? organizations[0];

  // Single-org case (the common one right now): just show the name, no
  // dropdown affordance for a choice that doesn't exist.
  if (organizations.length <= 1) {
    return (
      <span className="flex min-w-0 items-center gap-2 text-sm font-semibold tracking-tight text-foreground">
        <Building2 className="size-4 shrink-0 text-primary" />
        <span className="truncate">{active?.name ?? "Workspace"}</span>
      </span>
    );
  }

  function handleSelect(orgId: string) {
    setOpen(false);
    if (orgId === activeOrgId) return;
    startTransition(async () => {
      const result = await setActiveOrganization(orgId);
      if (result.ok) {
        router.refresh();
      }
    });
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={pending}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-semibold tracking-tight text-foreground transition-colors hover:bg-accent disabled:opacity-60"
      >
        <Building2 className="size-4 shrink-0 text-primary" />
        <span className="max-w-40 truncate">{active?.name ?? "Workspace"}</span>
        <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
      </button>

      <AnimatePresence>
        {open && (
          <>
            <button
              type="button"
              aria-label="Close workspace switcher"
              className="fixed inset-0 z-40 cursor-default"
              onClick={() => setOpen(false)}
              tabIndex={-1}
            />
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.98 }}
              transition={{ duration: 0.15, ease: EASES.outExpo }}
              className="absolute left-0 z-50 mt-1 w-64 overflow-hidden rounded-2xl border border-border bg-card p-1.5 shadow-card"
            >
              {organizations.map((org) => (
                <button
                  key={org.id}
                  type="button"
                  onClick={() => handleSelect(org.id)}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-accent",
                    org.id === activeOrgId ? "font-semibold text-foreground" : "text-muted-foreground",
                  )}
                >
                  <span className="truncate">{org.name}</span>
                  {org.id === activeOrgId && <Check className="size-4 shrink-0 text-primary" />}
                </button>
              ))}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
