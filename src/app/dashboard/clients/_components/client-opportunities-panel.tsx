import { TrendingUp, Layers, Share2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/app/dashboard/_lib/format";
import type { ClientOpportunity } from "@/generated/prisma/client";

const KIND_ICON = { UPSELL: TrendingUp, CROSS_SELL: Layers, REFERRAL: Share2 } as const;
const KIND_LABEL = { UPSELL: "Upsell", CROSS_SELL: "Cross-sell", REFERRAL: "Referral" } as const;

export function ClientOpportunitiesPanel({ opportunities, currency }: { opportunities: ClientOpportunity[]; currency?: string | null }) {
  if (opportunities.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No opportunities generated yet — this runs on a weekly scan (real product-catalog and subscription-tier
        comparisons; referral suggestions only for clients whose real health score already crosses the threshold).
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {opportunities.map((opp) => {
        const Icon = KIND_ICON[opp.kind];
        return (
          <div key={opp.id} className="flex flex-col gap-1 rounded-lg border border-border p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                <Icon className="size-3.5 text-primary" /> {opp.title}
              </span>
              <div className="flex items-center gap-2">
                <Badge variant="outline">{KIND_LABEL[opp.kind]}</Badge>
                <Badge variant="outline">{opp.status}</Badge>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">{opp.description}</p>
            <p className="text-xs text-muted-foreground">
              Evidence: {opp.evidence} {opp.estimatedValue != null ? `· Est. value: ${formatCurrency(opp.estimatedValue, currency)}` : ""} · Confidence:{" "}
              {opp.confidenceScore}%
            </p>
          </div>
        );
      })}
    </div>
  );
}
