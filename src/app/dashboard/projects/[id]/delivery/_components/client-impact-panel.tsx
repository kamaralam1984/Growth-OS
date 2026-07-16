import { Smile, Clock, DollarSign, TrendingUp, RefreshCw, PiggyBank } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";

export interface ClientImpactData {
  satisfactionAverage: number | null;
  satisfactionCount: number;
  estimatedCompletionDate: string | null;
  dueDate: string | null;
  contractValue: number | null;
  currency?: string | null;
}

function money(value: number, currency?: string | null): string {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: currency || "USD", maximumFractionDigits: 0 }).format(value);
}

/** Only Customer Satisfaction, Delivery Delay Risk, and Contract Value have a real data source in this schema. Upsell Opportunities / Renewal Probability / Future Revenue get an honest "not enough data" block below — never a fabricated number (no subscription/renewal-date model exists anywhere in this app). */
export function ClientImpactPanel({ data }: { data: ClientImpactData }) {
  const isLate = data.estimatedCompletionDate && data.dueDate && new Date(data.estimatedCompletionDate) > new Date(data.dueDate);

  return (
    <Card glass>
      <CardContent className="flex flex-col gap-4 p-5">
        <p className="text-sm font-medium text-foreground">Client Impact</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="flex items-start gap-2">
            <Smile className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Customer Satisfaction</p>
              <p className="text-sm font-semibold text-foreground">
                {data.satisfactionAverage != null ? `${data.satisfactionAverage.toFixed(1)}/5` : "Not enough data"}
              </p>
              {data.satisfactionCount > 0 && <p className="text-[11px] text-muted-foreground">{data.satisfactionCount} real rating(s)</p>}
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Clock className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Delivery Delay Risk</p>
              <p className="text-sm font-semibold text-foreground">
                {data.estimatedCompletionDate ? (isLate ? "At risk of delay" : "On track") : "Not enough data"}
              </p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <DollarSign className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Contract Value</p>
              <p className="text-sm font-semibold text-foreground">{data.contractValue != null ? money(data.contractValue, data.currency) : "Not set"}</p>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2 rounded-xl border border-dashed border-border p-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Not enough data yet</p>
          <div className="grid grid-cols-1 gap-2 text-xs text-muted-foreground sm:grid-cols-3">
            <span className="flex items-center gap-1.5">
              <TrendingUp className="size-3.5" /> Upsell opportunities
            </span>
            <span className="flex items-center gap-1.5">
              <RefreshCw className="size-3.5" /> Renewal probability
            </span>
            <span className="flex items-center gap-1.5">
              <PiggyBank className="size-3.5" /> Future revenue
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground">These need a real subscription/renewal-date data source that doesn&apos;t exist in this app yet — never shown as a guessed number.</p>
        </div>
      </CardContent>
    </Card>
  );
}
