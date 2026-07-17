import { Badge } from "@/components/ui/badge";
import type { ClientHealthSnapshot } from "@/generated/prisma/client";
import type { ClientHealthFactor } from "@/lib/clients/health-score";

const FACTOR_LABEL: Record<ClientHealthFactor["factor"], string> = {
  payment: "Payment behavior",
  engagement: "Engagement recency",
  delivery: "Project delivery",
  contract: "Contract / renewal",
};

function scoreColorClass(score: number): string {
  if (score >= 70) return "bg-emerald-500";
  if (score >= 40) return "bg-amber-500";
  return "bg-destructive";
}

export function ClientHealthFactorsCard({ snapshot }: { snapshot: ClientHealthSnapshot }) {
  const factors = (snapshot.factorsJson as unknown as ClientHealthFactor[] | null) ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline gap-3">
        <span className="text-3xl font-semibold text-foreground">{snapshot.overallScore}</span>
        <span className="text-sm text-muted-foreground">/ 100 overall — {snapshot.dataConfidence}% backed by real data</span>
      </div>

      <div className="flex flex-col gap-3">
        {factors.map((factor) => (
          <div key={factor.factor} className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 text-foreground">
                {FACTOR_LABEL[factor.factor]}
                {factor.isNeutralFallback ? (
                  <Badge variant="outline" className="text-[10px] text-muted-foreground">
                    No data — neutral default
                  </Badge>
                ) : null}
              </span>
              <span className="text-muted-foreground">{factor.score}/100</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div className={`h-full rounded-full ${scoreColorClass(factor.score)}`} style={{ width: `${factor.score}%` }} />
            </div>
            <p className="text-xs text-muted-foreground">{factor.dataSource}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
