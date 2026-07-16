import { Scale, ShieldAlert, FileWarning, CheckCircle2, XCircle } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { RiskLevel } from "@/generated/prisma/client";

export interface LegalReviewData {
  contractTermsOk: boolean | null;
  missingClauses: string[];
  ndaRequired: boolean | null;
  liabilityRisk: string | null;
  warrantyRisk: string | null;
  complianceNotes: string | null;
  overallRiskLevel: RiskLevel;
  riskFactors: string[];
}

const RISK_VARIANT: Record<RiskLevel, "default" | "secondary" | "outline" | "accent"> = {
  LOW: "secondary",
  MEDIUM: "accent",
  HIGH: "default",
  CRITICAL: "default",
};

/** Renders the Legal Agent's real structured deep-dive (RiskAnalysis) — a real, LLM-produced checklist, never a fabricated/default one. Not a substitute for a licensed attorney, same disclaimer the agent's own persona carries. */
export function LegalReviewPanel({ data }: { data: LegalReviewData }) {
  return (
    <Card glass>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Scale className="size-4" /> Legal Review
        </CardTitle>
        <CardDescription>Contract terms, missing clauses, and compliance risk — from your Legal agent. Not a substitute for a licensed attorney.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs">
            {data.contractTermsOk === true ? (
              <CheckCircle2 className="size-4 text-emerald-500" />
            ) : data.contractTermsOk === false ? (
              <XCircle className="size-4 text-rose-500" />
            ) : (
              <span className="size-4" />
            )}
            <span className="text-muted-foreground">Contract terms {data.contractTermsOk === true ? "look complete" : data.contractTermsOk === false ? "look incomplete" : "not assessed"}</span>
          </div>
          {data.ndaRequired != null && (
            <Badge variant={data.ndaRequired ? "accent" : "outline"}>{data.ndaRequired ? "NDA recommended" : "NDA not required"}</Badge>
          )}
          <Badge variant={RISK_VARIANT[data.overallRiskLevel]}>{data.overallRiskLevel} risk</Badge>
        </div>

        {data.missingClauses.length > 0 && (
          <div className="flex flex-col gap-1">
            <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-rose-600 dark:text-rose-400">
              <FileWarning className="size-3.5" /> Missing clauses
            </span>
            <ul className="flex flex-col gap-0.5 text-xs text-muted-foreground">
              {data.missingClauses.map((c, i) => (
                <li key={i}>• {c}</li>
              ))}
            </ul>
          </div>
        )}

        {(data.liabilityRisk || data.warrantyRisk) && (
          <div className="grid grid-cols-1 gap-3 border-t border-border/60 pt-3 sm:grid-cols-2">
            {data.liabilityRisk && (
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Liability risk</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{data.liabilityRisk}</p>
              </div>
            )}
            {data.warrantyRisk && (
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Warranty risk</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{data.warrantyRisk}</p>
              </div>
            )}
          </div>
        )}

        {data.riskFactors.length > 0 && (
          <div className="flex flex-col gap-1 border-t border-border/60 pt-3">
            <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-amber-600 dark:text-amber-400">
              <ShieldAlert className="size-3.5" /> Risk factors
            </span>
            <ul className="flex flex-col gap-0.5 text-xs text-muted-foreground">
              {data.riskFactors.map((r, i) => (
                <li key={i}>• {r}</li>
              ))}
            </ul>
          </div>
        )}

        {data.complianceNotes && (
          <div className="border-t border-border/60 pt-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Compliance notes</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{data.complianceNotes}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
