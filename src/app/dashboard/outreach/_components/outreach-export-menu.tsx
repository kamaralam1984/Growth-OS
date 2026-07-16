"use client";

import * as React from "react";
import { Download, ChevronDown } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

import { EASES } from "@/animations";

const OPTIONS = [
  { href: "/api/export/campaigns?format=csv", label: "Campaigns CSV" },
  { href: "/api/export/campaigns?format=excel", label: "Campaigns Excel" },
  { href: "/api/export/campaigns?format=pdf&period=weekly", label: "Weekly report (PDF)" },
  { href: "/api/export/campaigns?format=pdf&period=monthly", label: "Monthly report (PDF)" },
  { href: "/api/export/campaigns?format=pdf&period=all", label: "Full performance report (PDF)" },
];

export function OutreachExportMenu() {
  const [open, setOpen] = React.useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex items-center gap-1.5 text-sm text-primary hover:underline"
      >
        <Download className="size-4" /> Reports
        <ChevronDown className="size-3.5" />
      </button>

      <AnimatePresence>
        {open && (
          <>
            <button type="button" aria-label="Close export menu" className="fixed inset-0 z-40 cursor-default" onClick={() => setOpen(false)} tabIndex={-1} />
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.98 }}
              transition={{ duration: 0.15, ease: EASES.outExpo }}
              className="absolute right-0 z-50 mt-1 w-56 overflow-hidden rounded-2xl border border-border bg-card p-1.5 shadow-card"
            >
              {OPTIONS.map((opt) => (
                <a
                  key={opt.href}
                  href={opt.href}
                  onClick={() => setOpen(false)}
                  className="block rounded-lg px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-accent"
                >
                  {opt.label}
                </a>
              ))}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
