import { DollarSign, TrendingDown, TrendingUp, AlertTriangle } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { PaymentRiskLevel } from "@/generated/prisma/client";

export interface FinanceReviewData {
  estimatedRevenue: number | null;
  estimatedCost: number | null;
  grossMargin: number | null;
  netMargin: number | null;
  profit: number | null;
  discountImpact: number | null;
  paymentRiskLevel: PaymentRiskLevel;
  paymentRiskNotes: string | null;
}

const RISK_VARIANT: Record<PaymentRiskLevel, "default" | "secondary" | "outline" | "accent"> = {
  LOW: "secondary",
  MEDIUM: "accent",
  HIGH: "default",
};

function money(value: number | null, currency?: string | null): string {
  if (value == null) return "—";
  return new Intl.NumberFormat(undefined, { style: "currency", currency: currency || "USD", maximumFractionDigits: 0 }).format(value);
}

/** Renders the Finance Agent's real structured deep-dive (ProfitAnalysis) — never a client-side estimate, always what the agent actually reported. */
export function FinanceReviewPanel({ data, currency }: { data: FinanceReviewData; currency?: string | null }) {
  return (
    <Card glass>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <DollarSign className="size-4" /> Finance Review
        </CardTitle>
        <CardDescription>Estimated revenue, margin, cost, and payment risk — from your Finance agent.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Stat label="Est. revenue" value={money(data.estimatedRevenue, currency)} />
          <Stat label="Est. cost" value={money(data.estimatedCost, currency)} />
          <Stat label="Profit" value={money(data.profit, currency)} icon={data.profit != null && data.profit >= 0 ? TrendingUp : TrendingDown} />
          <Stat label="Gross margin" value={data.grossMargin != null ? `${Math.round(data.grossMargin)}%` : "—"} />
          <Stat label="Net margin" value={data.netMargin != null ? `${Math.round(data.netMargin)}%` : "—"} />
          <Stat label="Discount impact" value={data.discountImpact != null ? money(data.discountImpact, currency) : "—"} />
        </div>
        <div className="flex flex-col gap-1.5 border-t border-border/60 pt-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Payment risk</span>
            <Badge variant={RISK_VARIANT[data.paymentRiskLevel]}>{data.paymentRiskLevel}</Badge>
          </div>
          {data.paymentRiskNotes && (
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> {data.paymentRiskNotes}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, icon: Icon }: { label: string; value: string; icon?: typeof TrendingUp }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/40 p-3">
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 flex items-center gap-1 text-sm font-semibold text-foreground">
        {Icon && <Icon className="size-3.5" />}
        {value}
      </p>
    </div>
  );
}
