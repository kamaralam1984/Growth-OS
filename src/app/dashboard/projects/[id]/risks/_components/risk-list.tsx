"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, ShieldCheck, CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { runRiskDetection, updateRiskStatus } from "../actions";

export interface RiskRow {
  id: string;
  category: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  status: "OPEN" | "MITIGATED" | "RESOLVED";
  title: string;
  description: string;
  createdAt: string;
  resolvedAt: string | null;
}

const SEVERITY_CLASS: Record<string, string> = {
  LOW: "border-border bg-transparent text-foreground",
  MEDIUM: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  HIGH: "border-orange-500/30 bg-orange-500/10 text-orange-600 dark:text-orange-400",
  CRITICAL: "border-destructive/30 bg-destructive/10 text-destructive",
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "accent"> = {
  OPEN: "outline",
  MITIGATED: "accent",
  RESOLVED: "default",
};

export function RiskList({ projectId, risks }: { projectId: string; risks: RiskRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleDetect() {
    startTransition(async () => {
      await runRiskDetection(projectId);
      router.refresh();
    });
  }

  function handleStatus(riskId: string, status: "MITIGATED" | "RESOLVED" | "OPEN") {
    startTransition(async () => {
      await updateRiskStatus(riskId, status);
      router.refresh();
    });
  }

  const openRisks = risks.filter((r) => r.status === "OPEN");
  const otherRisks = risks.filter((r) => r.status !== "OPEN");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={handleDetect} disabled={pending}>
          <RefreshCw className="size-4" /> Run detection now
        </Button>
      </div>

      {risks.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">No risks detected. Run detection to scan real project data.</CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {[...openRisks, ...otherRisks].map((risk) => (
            <Card key={risk.id} className={`border ${SEVERITY_CLASS[risk.severity]}`}>
              <CardContent className="flex flex-wrap items-start justify-between gap-3 p-4">
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-foreground">{risk.title}</p>
                    <Badge variant="outline">{risk.category.replace(/_/g, " ")}</Badge>
                    <Badge variant={STATUS_VARIANT[risk.status]}>{risk.status}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{risk.description}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {risk.severity} · Detected {new Date(risk.createdAt).toLocaleDateString()}
                    {risk.resolvedAt ? ` · Resolved ${new Date(risk.resolvedAt).toLocaleDateString()}` : ""}
                  </p>
                </div>
                {risk.status === "OPEN" && (
                  <div className="flex shrink-0 gap-2">
                    <Button variant="outline" size="sm" onClick={() => handleStatus(risk.id, "MITIGATED")} disabled={pending}>
                      <ShieldCheck className="size-4" /> Mitigate
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => handleStatus(risk.id, "RESOLVED")} disabled={pending}>
                      <CheckCircle2 className="size-4" /> Resolve
                    </Button>
                  </div>
                )}
                {risk.status === "MITIGATED" && (
                  <Button variant="outline" size="sm" onClick={() => handleStatus(risk.id, "RESOLVED")} disabled={pending}>
                    <CheckCircle2 className="size-4" /> Resolve
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
