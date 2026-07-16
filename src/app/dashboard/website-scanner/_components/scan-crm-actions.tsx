"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Handshake, UserCog, Flag, FileText, Check } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { saveScanToCrm, assignScanOwner, markScanPriority, generateProposalFromScan } from "../actions";

const PRIORITY_OPTIONS = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;
type Priority = (typeof PRIORITY_OPTIONS)[number];

const PRIORITY_VARIANT: Record<Priority, "outline" | "secondary" | "accent" | "default"> = {
  LOW: "outline",
  NORMAL: "secondary",
  HIGH: "accent",
  URGENT: "default",
};

export interface ScanCrmActionsProps {
  scanId: string;
  hasLead: boolean;
  ownerUserId: string | null;
  priority: Priority;
  hasExecutiveReport: boolean;
  members: Array<{ id: string; name: string | null }>;
}

export function ScanCrmActions({ scanId, hasLead, ownerUserId, priority, hasExecutiveReport, members }: ScanCrmActionsProps) {
  const router = useRouter();
  const [savingToCrm, startSaveToCrm] = useTransition();
  const [assigningOwner, startAssignOwner] = useTransition();
  const [markingPriority, startMarkPriority] = useTransition();
  const [generatingProposal, startGenerateProposal] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function handleSaveToCrm() {
    setMessage(null);
    startSaveToCrm(async () => {
      const result = await saveScanToCrm(scanId);
      setMessage(result.ok ? (result.alreadyInCrm ? "Already in CRM." : "Saved to CRM pipeline.") : result.error ?? "Something went wrong.");
      if (result.ok) router.refresh();
    });
  }

  function handleAssignOwner(value: string) {
    startAssignOwner(async () => {
      await assignScanOwner(scanId, value || null);
      router.refresh();
    });
  }

  function handleMarkPriority(value: Priority) {
    startMarkPriority(async () => {
      await markScanPriority(scanId, value);
      router.refresh();
    });
  }

  function handleGenerateProposal() {
    setMessage(null);
    startGenerateProposal(async () => {
      const result = await generateProposalFromScan(scanId);
      setMessage(result.ok ? "Draft proposal created." : result.error ?? "Something went wrong.");
      if (result.ok) router.refresh();
    });
  }

  return (
    <Card glass>
      <CardHeader>
        <CardTitle className="text-base">CRM actions</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 pt-0">
        {message && <p className="text-xs text-primary">{message}</p>}

        <Button size="sm" variant="outline" onClick={handleSaveToCrm} disabled={savingToCrm || hasLead}>
          {hasLead ? <Check className="size-3.5" /> : <Handshake className="size-3.5" />}
          {hasLead ? "Already in CRM" : savingToCrm ? "Saving…" : "Save Report → Create Lead"}
        </Button>

        <div className="flex flex-col gap-1.5">
          <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <UserCog className="size-3.5" /> Owner
          </label>
          <Select value={ownerUserId ?? ""} onChange={(e) => handleAssignOwner(e.target.value)} disabled={assigningOwner} className="h-9 text-sm">
            <option value="">Unassigned</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name ?? "Unnamed member"}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Flag className="size-3.5" /> Priority
          </label>
          <div className="flex flex-wrap gap-1.5">
            {PRIORITY_OPTIONS.map((opt) => (
              <button key={opt} type="button" onClick={() => handleMarkPriority(opt)} disabled={markingPriority}>
                <Badge variant={priority === opt ? PRIORITY_VARIANT[opt] : "outline"} className={priority === opt ? "" : "opacity-60"}>
                  {opt}
                </Badge>
              </button>
            ))}
          </div>
        </div>

        <Button size="sm" variant="outline" onClick={handleGenerateProposal} disabled={generatingProposal || !hasExecutiveReport}>
          <FileText className="size-3.5" />
          {generatingProposal ? "Generating…" : "Generate Proposal Request"}
        </Button>
        {!hasExecutiveReport && <p className="text-[11px] text-muted-foreground">Available once the AI Executive Report has been generated.</p>}
      </CardContent>
    </Card>
  );
}
