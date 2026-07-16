"use client";

import { useState, useTransition } from "react";
import { Mail } from "lucide-react";

import { Button } from "@/components/ui/button";
import { AiErrorBanner, type AIErrorKind } from "@/app/board/_components/ai-error-banner";
import { sendDeliveryReport, type ActionResult } from "../actions";

const REPORT_TYPES: Array<{ value: "WEEKLY" | "MONTHLY" | "PROJECT_HEALTH" | "RISK"; label: string }> = [
  { value: "WEEKLY", label: "Weekly" },
  { value: "MONTHLY", label: "Monthly" },
  { value: "PROJECT_HEALTH", label: "Project Health" },
  { value: "RISK", label: "Risk" },
];

/** Owner-triggered (no cron exists) — generates a real report from real data and emails org owners immediately. */
export function SendReportMenu({ projectId }: { projectId: string }) {
  const [pending, startTransition] = useTransition();
  const [busyType, setBusyType] = useState<string | null>(null);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [sentType, setSentType] = useState<string | null>(null);

  function send(type: (typeof REPORT_TYPES)[number]["value"]) {
    setBusyType(type);
    setResult(null);
    setSentType(null);
    startTransition(async () => {
      const res = await sendDeliveryReport(projectId, type);
      setResult(res);
      if (res.ok) setSentType(type);
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Mail className="size-3.5" /> Send report:
        </span>
        {REPORT_TYPES.map((r) => (
          <Button key={r.value} size="sm" variant="outline" onClick={() => send(r.value)} disabled={pending}>
            {pending && busyType === r.value ? "Sending…" : r.label}
          </Button>
        ))}
      </div>
      {sentType && <p className="text-xs text-primary">Report sent to your organization&apos;s owners and admins.</p>}
      {result && !result.ok && <AiErrorBanner error={result.error ?? "Something went wrong."} kind={result.errorKind as AIErrorKind} />}
    </div>
  );
}
