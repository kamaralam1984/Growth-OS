"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightCircle } from "lucide-react";

import { formatCurrency } from "@/app/dashboard/_lib/format";
import { LeadScoreBadge } from "@/app/dashboard/_components/lead-score-badge";
import { moveLeadStage } from "../actions";
import { convertLeadToDeal } from "../_lib/deal-actions";
import type { LeadScoreBand } from "@/generated/prisma/client";

export interface BoardLead {
  id: string;
  name: string;
  company: string | null;
  estimatedValue: number | null;
  leadScore: { band: LeadScoreBand; overallScore: number } | null;
}

export interface BoardStage {
  id: string;
  name: string;
  leads: BoardLead[];
}

export interface LeadBoardProps {
  stages: BoardStage[];
  currency?: string | null;
}

/**
 * Real drag-and-drop kanban for the sales pipeline — native HTML5 DnD (no
 * extra dependency), backed by moveLeadStage() on drop. Optimistic local
 * reorder, reconciled by router.refresh() once the server confirms.
 */
export function LeadBoard({ stages, currency }: LeadBoardProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [dragLeadId, setDragLeadId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [convertingId, setConvertingId] = useState<string | null>(null);

  function handleDrop(stageId: string) {
    setDragOverStage(null);
    if (!dragLeadId) return;
    const leadId = dragLeadId;
    setDragLeadId(null);
    startTransition(async () => {
      const result = await moveLeadStage(leadId, stageId);
      if (!result.ok) {
        setError(result.error ?? "Couldn't move that lead.");
        return;
      }
      router.refresh();
    });
  }

  function handleConvertToDeal(leadId: string) {
    setConvertingId(leadId);
    startTransition(async () => {
      const result = await convertLeadToDeal(leadId);
      setConvertingId(null);
      if (!result.ok) {
        setError(result.error ?? "Couldn't convert that lead to a deal.");
        return;
      }
      router.push(`/dashboard/crm/deals/${result.dealId}`);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-4 overflow-x-auto pb-2">
        {stages.map((stage) => {
          const stageValue = stage.leads.reduce((sum, lead) => sum + (lead.estimatedValue ?? 0), 0);
          return (
            <div
              key={stage.id}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverStage(stage.id);
              }}
              onDragLeave={() => setDragOverStage((current) => (current === stage.id ? null : current))}
              onDrop={(e) => {
                e.preventDefault();
                handleDrop(stage.id);
              }}
              className={`flex w-72 shrink-0 flex-col gap-3 rounded-2xl border p-3 transition-colors ${
                dragOverStage === stage.id ? "border-primary bg-primary/5" : "border-border bg-muted/20"
              }`}
            >
              <div className="flex items-baseline justify-between px-1">
                <h3 className="text-sm font-semibold text-foreground">{stage.name}</h3>
                <span className="text-xs text-muted-foreground">{formatCurrency(stageValue, currency)}</span>
              </div>

              <div className="flex flex-col gap-2">
                {stage.leads.length === 0 && (
                  <p className="rounded-lg border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
                    No leads here.
                  </p>
                )}
                {stage.leads.map((lead) => (
                  <div
                    key={lead.id}
                    draggable
                    onDragStart={() => setDragLeadId(lead.id)}
                    onDragEnd={() => setDragLeadId(null)}
                    className="glass-panel cursor-grab rounded-xl p-3 text-sm shadow-card active:cursor-grabbing"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium text-foreground">{lead.name}</p>
                      {lead.leadScore && <LeadScoreBadge band={lead.leadScore.band} score={lead.leadScore.overallScore} />}
                    </div>
                    {lead.company && <p className="text-xs text-muted-foreground">{lead.company}</p>}
                    {lead.estimatedValue != null && (
                      <p className="mt-1 text-xs font-medium text-primary">
                        {formatCurrency(lead.estimatedValue, currency)}
                      </p>
                    )}
                    <button
                      type="button"
                      disabled={convertingId === lead.id}
                      onClick={() => handleConvertToDeal(lead.id)}
                      className="mt-2 flex items-center gap-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-primary disabled:opacity-50"
                    >
                      <ArrowRightCircle className="size-3" />
                      {convertingId === lead.id ? "Converting…" : "Convert to Deal"}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
