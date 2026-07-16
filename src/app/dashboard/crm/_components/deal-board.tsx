"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { formatCurrency } from "@/app/dashboard/_lib/format";
import { moveDealStage } from "../_lib/deal-actions";

export interface BoardDeal {
  id: string;
  name: string;
  value: number | null;
  probability: number | null;
  priority: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  ownerName: string | null;
  companyName: string | null;
  products: string[];
}

export interface BoardDealStage {
  id: string;
  name: string;
  deals: BoardDeal[];
}

const PRIORITY_CLASS: Record<BoardDeal["priority"], string> = {
  LOW: "bg-sky-500/15 text-sky-500",
  NORMAL: "bg-muted text-muted-foreground",
  HIGH: "bg-amber-500/15 text-amber-500",
  URGENT: "bg-red-500/15 text-red-500",
};

/** Real drag-and-drop Deal Kanban — native HTML5 DnD, mirrors LeadBoard exactly (see ../_components/lead-board.tsx). */
export function DealBoard({ stages, currency }: { stages: BoardDealStage[]; currency?: string | null }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [dragDealId, setDragDealId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleDrop(stageId: string) {
    setDragOverStage(null);
    if (!dragDealId) return;
    const dealId = dragDealId;
    setDragDealId(null);
    startTransition(async () => {
      const result = await moveDealStage(dealId, stageId);
      if (!result.ok) {
        setError(result.error ?? "Couldn't move that deal.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-4 overflow-x-auto pb-2">
        {stages.map((stage) => {
          const stageValue = stage.deals.reduce((sum, d) => sum + (d.value ?? 0), 0);
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
                {stage.deals.length === 0 && (
                  <p className="rounded-lg border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
                    No deals here.
                  </p>
                )}
                {stage.deals.map((deal) => (
                  <Link
                    key={deal.id}
                    href={`/dashboard/crm/deals/${deal.id}`}
                    draggable
                    onDragStart={() => setDragDealId(deal.id)}
                    onDragEnd={() => setDragDealId(null)}
                    className="glass-panel block cursor-grab rounded-xl p-3 text-sm shadow-card active:cursor-grabbing"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium text-foreground">{deal.name}</p>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${PRIORITY_CLASS[deal.priority]}`}>
                        {deal.priority}
                      </span>
                    </div>
                    {deal.companyName && <p className="text-xs text-muted-foreground">{deal.companyName}</p>}
                    <div className="mt-1 flex items-center justify-between gap-2">
                      {deal.value != null && <p className="text-xs font-medium text-primary">{formatCurrency(deal.value, currency)}</p>}
                      {deal.probability != null && <p className="text-xs text-muted-foreground">{deal.probability}%</p>}
                    </div>
                    {deal.ownerName && <p className="mt-1 text-[11px] text-muted-foreground">Owner: {deal.ownerName}</p>}
                    {deal.products.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {deal.products.slice(0, 3).map((p) => (
                          <span key={p} className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                            {p}
                          </span>
                        ))}
                      </div>
                    )}
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
