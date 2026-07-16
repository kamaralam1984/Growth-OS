"use client";

import * as React from "react";
import { Download, ChevronDown } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

import { EASES } from "@/animations";
import type { ReportTier } from "@/lib/reports/tiers";

const TIERS: Array<{ tier: ReportTier; label: string }> = [
  { tier: "ceo", label: "CEO — full detail" },
  { tier: "board", label: "Board — health + revenue + risk" },
  { tier: "investor", label: "Investor — MRR/ARR/CAC:LTV" },
];

const FORMATS = [
  { format: "pdf", label: "PDF" },
  { format: "pptx", label: "PowerPoint (.pptx)" },
  { format: "docx", label: "Word (.docx)" },
  { format: "excel", label: "Excel (.xlsx)" },
] as const;

export function AnalyticsReportExportMenu() {
  const [open, setOpen] = React.useState(false);
  const [tier, setTier] = React.useState<ReportTier>("ceo");

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex items-center gap-1.5 text-sm text-primary hover:underline"
      >
        <Download className="size-4" /> Export Report
        <ChevronDown className="size-3.5" />
      </button>

      <AnimatePresence>
        {open && (
          <>
            <button
              type="button"
              aria-label="Close export menu"
              className="fixed inset-0 z-40 cursor-default"
              onClick={() => setOpen(false)}
              tabIndex={-1}
            />
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.98 }}
              transition={{ duration: 0.15, ease: EASES.outExpo }}
              className="absolute right-0 z-50 mt-1 w-64 overflow-hidden rounded-2xl border border-border bg-card p-1.5 shadow-card"
            >
              <p className="px-3 pt-1.5 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Tier</p>
              {TIERS.map((opt) => (
                <button
                  key={opt.tier}
                  type="button"
                  onClick={() => setTier(opt.tier)}
                  className={`block w-full rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-accent ${
                    tier === opt.tier ? "text-primary" : "text-foreground"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
              <div className="my-1 border-t border-border" />
              <p className="px-3 pt-1 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Format</p>
              {FORMATS.map((opt) => (
                <a
                  key={opt.format}
                  href={`/api/export/analytics-report/${tier}?format=${opt.format}`}
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
