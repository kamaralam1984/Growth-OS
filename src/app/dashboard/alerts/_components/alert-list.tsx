"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { BellOff, CheckCircle2, Lightbulb } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { acknowledgeAlert, resolveAlert } from "../actions";

export interface AlertRow {
  id: string;
  type: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  status: "ACTIVE" | "ACKNOWLEDGED" | "RESOLVED";
  title: string;
  message: string;
  relatedEntityType: string | null;
  metricValue: number | null;
  thresholdValue: number | null;
  formula: string;
  mitigationSuggestions: string[];
  triggeredAt: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
}

const SEVERITY_CLASS: Record<string, string> = {
  LOW: "border-border bg-transparent text-foreground",
  MEDIUM: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  HIGH: "border-orange-500/30 bg-orange-500/10 text-orange-600 dark:text-orange-400",
  CRITICAL: "border-destructive/30 bg-destructive/10 text-destructive",
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "accent"> = {
  ACTIVE: "outline",
  ACKNOWLEDGED: "accent",
  RESOLVED: "default",
};

export function AlertList({ alerts }: { alerts: AlertRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleAcknowledge(alertId: string) {
    startTransition(async () => {
      await acknowledgeAlert(alertId);
      router.refresh();
    });
  }

  function handleResolve(alertId: string) {
    startTransition(async () => {
      await resolveAlert(alertId);
      router.refresh();
    });
  }

  const active = alerts.filter((a) => a.status === "ACTIVE");
  const acknowledged = alerts.filter((a) => a.status === "ACKNOWLEDGED");
  const resolved = alerts.filter((a) => a.status === "RESOLVED");

  if (alerts.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-sm text-muted-foreground">
          No alerts yet. Smart Alerts evaluates real business data hourly and only ever posts a real, threshold-crossing trigger here.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {[...active, ...acknowledged, ...resolved].map((alert) => (
        <Card key={alert.id} className={`border ${SEVERITY_CLASS[alert.severity]}`}>
          <CardContent className="flex flex-col gap-3 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-foreground">{alert.title}</p>
                  <Badge variant="outline">{alert.type.replace(/_/g, " ")}</Badge>
                  <Badge variant={STATUS_VARIANT[alert.status]}>{alert.status}</Badge>
                  <Badge variant="outline">{alert.severity}</Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{alert.message}</p>
              </div>
              {alert.status === "ACTIVE" && (
                <div className="flex shrink-0 gap-2">
                  <Button variant="outline" size="sm" onClick={() => handleAcknowledge(alert.id)} disabled={pending}>
                    <BellOff className="size-4" /> Acknowledge
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleResolve(alert.id)} disabled={pending}>
                    <CheckCircle2 className="size-4" /> Resolve
                  </Button>
                </div>
              )}
              {alert.status === "ACKNOWLEDGED" && (
                <Button variant="outline" size="sm" onClick={() => handleResolve(alert.id)} disabled={pending}>
                  <CheckCircle2 className="size-4" /> Resolve
                </Button>
              )}
            </div>

            <div className="rounded-md border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground">
              <p>
                Metric value: <span className="font-medium text-foreground">{alert.metricValue ?? "—"}</span>
                {" · "}
                Threshold: <span className="font-medium text-foreground">{alert.thresholdValue ?? "—"}</span>
                {alert.relatedEntityType ? (
                  <>
                    {" · "}
                    Entity: <span className="font-medium text-foreground">{alert.relatedEntityType}</span>
                  </>
                ) : null}
              </p>
              <p className="mt-1 font-mono">{alert.formula}</p>
              <p className="mt-1">
                Triggered {new Date(alert.triggeredAt).toLocaleString()}
                {alert.acknowledgedAt ? ` · Acknowledged ${new Date(alert.acknowledgedAt).toLocaleString()}` : ""}
                {alert.resolvedAt ? ` · Resolved ${new Date(alert.resolvedAt).toLocaleString()}` : ""}
              </p>
            </div>

            {alert.mitigationSuggestions.length > 0 && (
              <div className="rounded-md border border-primary/20 bg-primary/5 p-3 text-xs">
                <p className="flex items-center gap-1.5 font-medium text-primary">
                  <Lightbulb className="size-3.5" /> AI-suggested next steps — grounded in this alert, not independent fact
                </p>
                <ul className="mt-1.5 list-inside list-disc text-muted-foreground">
                  {alert.mitigationSuggestions.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
