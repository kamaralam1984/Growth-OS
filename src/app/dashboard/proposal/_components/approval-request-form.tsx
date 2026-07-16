"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";

export interface ApprovalRequestFormProps {
  documentId: string;
  approvers: Array<{ userId: string; name: string | null; email: string | null }>;
  action: (documentId: string, approverUserId: string, note?: string) => Promise<{ ok: boolean; error?: string }>;
}

/** Reused on every document type's detail page — reuses the CRM Deal's Task-based approval pattern (see requestDealApproval) rather than the EmailDraft-bound Approval model. */
export function ApprovalRequestForm({ documentId, approvers, action }: ApprovalRequestFormProps) {
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
      const result = await action(documentId, approverId);
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
