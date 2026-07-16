import { Truck, ShieldCheck, Gauge, ShieldAlert, DollarSign, Smile } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import type { ProjectHealthScores } from "@/lib/projects/health-score";

const ROWS: Array<{ key: keyof ProjectHealthScores; label: string; icon: typeof Truck }> = [
  { key: "deliveryScore", label: "Delivery", icon: Truck },
  { key: "qualityScore", label: "Quality", icon: ShieldCheck },
  { key: "velocityScore", label: "Velocity", icon: Gauge },
  { key: "riskScore", label: "Risk", icon: ShieldAlert },
  { key: "budgetScore", label: "Budget", icon: DollarSign },
  { key: "customerHappinessScore", label: "Customer Happiness", icon: Smile },
];

function barColor(score: number): string {
  if (score >= 75) return "bg-primary";
  if (score >= 50) return "bg-amber-500";
  return "bg-destructive";
}

/** Every number here is real deterministic math from computeProjectHealthScore — zero LLM involvement in the score itself. */
export function HealthScorePanel({ scores }: { scores: ProjectHealthScores }) {
  return (
    <Card glass>
      <CardContent className="flex flex-col gap-4 p-5">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-foreground">Project Health Score</p>
          <p className="text-2xl font-semibold text-foreground">{scores.overallScore}<span className="text-sm font-normal text-muted-foreground">/100</span></p>
        </div>
        <div className="flex flex-col gap-2.5">
          {ROWS.map(({ key, label, icon: Icon }) => {
            const value = scores[key];
            return (
              <div key={key} className="flex items-center gap-3">
                <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="w-40 shrink-0 text-xs text-muted-foreground">{label}</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                  <div className={`h-full rounded-full ${barColor(value)}`} style={{ width: `${value}%` }} />
                </div>
                <span className="w-9 shrink-0 text-right text-xs font-medium text-foreground">{value}</span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
