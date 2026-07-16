"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { requestDealApproval } from "../_lib/deal-actions";

export interface DealApprovalRequestProps {
  dealId: string;
  approvers: Array<{ userId: string; name: string | null; email: string | null }>;
}

/** Reuses Task (type=APPROVAL) + notifyOrganizationOwners for the "Manager/Owner deal approval" workflow — see requestDealApproval(). */
export function DealApprovalRequest({ dealId, approvers }: DealApprovalRequestProps) {
  const router = useRouter();
  const [approverId, setApproverId] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  function handleRequest() {
    if (!approverId) {
      setError("Choose an approver first.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await requestDealApproval(dealId, approverId);
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      setSent(true);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={approverId} onChange={(e) => setApproverId(e.target.value)} className="max-w-[200px]">
        <option value="">Choose approver…</option>
        {approvers.map((a) => (
          <option key={a.userId} value={a.userId}>
            {a.name ?? a.email ?? a.userId}
          </option>
        ))}
      </Select>
      <Button type="button" size="sm" variant="outline" onClick={handleRequest} disabled={pending}>
        <ShieldCheck className="size-3.5" />
        {pending ? "Requesting…" : sent ? "Requested" : "Request Approval"}
      </Button>
      {error && <p className="w-full text-xs text-destructive">{error}</p>}
    </div>
  );
}
