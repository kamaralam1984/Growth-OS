"use client";

import { useState, useTransition } from "react";
import { ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { updateApprovalPolicy, type UpdateApprovalPolicyInput } from "../_lib/approval-policy-actions";

export interface ApprovalPolicySectionProps {
  orgId: string;
  canEdit: boolean;
  initial: UpdateApprovalPolicyInput;
}

const DOC_KIND_OPTIONS: Array<{ value: UpdateApprovalPolicyInput["appliesToDocKinds"][number]; label: string }> = [
  { value: "PROPOSAL", label: "Proposals" },
  { value: "QUOTATION", label: "Quotations" },
  { value: "CONTRACT", label: "Contracts" },
  { value: "INVOICE", label: "Invoices" },
];

/**
 * Configures the reusable Approval Engine gating "Send to client" across
 * Proposals/Quotations/Contracts/Invoices — Advisory (informational banner
 * only, nothing blocked) or Approval Required (Send is blocked until the AI
 * Proposal Review Board approves, or an owner/admin overrides with a
 * required reason, logged to AuditLog). Designed to be reused by future
 * phases (Projects, Billing, Enterprise Workflow Automation) — see
 * src/lib/approval-engine.ts.
 */
export function ApprovalPolicySection({ orgId, canEdit, initial }: ApprovalPolicySectionProps) {
  const [mode, setMode] = useState(initial.mode);
  const [appliesTo, setAppliesTo] = useState<Set<string>>(new Set(initial.appliesToDocKinds));
  const [allowOverride, setAllowOverride] = useState(initial.allowOwnerOverride);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, startTransition] = useTransition();

  function toggleDocKind(value: string) {
    setSuccess(false);
    setAppliesTo((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    startTransition(async () => {
      const result = await updateApprovalPolicy(orgId, {
        mode,
        appliesToDocKinds: Array.from(appliesTo) as UpdateApprovalPolicyInput["appliesToDocKinds"],
        allowOwnerOverride: allowOverride,
      });
      if (!result.ok) {
        setError(result.error ?? "Something went wrong. Please try again.");
        return;
      }
      setSuccess(true);
    });
  }

  if (!canEdit) {
    return (
      <Card glass>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="size-4" /> AI Board approval policy
          </CardTitle>
          <CardDescription>Whether the AI Proposal Review Board must approve documents before they can be sent to clients.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-foreground">
            {initial.mode === "ADVISORY" ? "Advisory — Board review is informational only; nothing is blocked." : "Approval Required — Send is blocked until the Board approves (or an owner/admin overrides)."}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card glass>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="size-4" /> AI Board approval policy
        </CardTitle>
        <CardDescription>
          Whether Proposals/Quotations/Contracts/Invoices can be sent to a client without the AI Proposal Review Board&rsquo;s
          approval.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="approval-mode" className="text-sm font-medium text-foreground">
              Policy mode
            </label>
            <Select
              id="approval-mode"
              value={mode}
              onChange={(e) => {
                setMode(e.target.value as UpdateApprovalPolicyInput["mode"]);
                setSuccess(false);
              }}
            >
              <option value="ADVISORY">Advisory — show recommendations, never block sending</option>
              <option value="APPROVAL_REQUIRED">Approval Required — block sending until the Board approves</option>
            </Select>
          </div>

          {mode === "APPROVAL_REQUIRED" && (
            <>
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-foreground">Applies to</span>
                <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                  {DOC_KIND_OPTIONS.map((opt) => (
                    <label key={opt.value} className="flex items-center gap-1.5 text-sm text-foreground">
                      <input type="checkbox" checked={appliesTo.has(opt.value)} onChange={() => toggleDocKind(opt.value)} />
                      {opt.label}
                    </label>
                  ))}
                </div>
              </div>

              <label className="flex items-center gap-1.5 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={allowOverride}
                  onChange={(e) => {
                    setAllowOverride(e.target.checked);
                    setSuccess(false);
                  }}
                />
                Allow owners/admins to override a blocked send (a reason is always required and recorded in the audit log)
              </label>
            </>
          )}

          {error && <p className="text-xs text-destructive">{error}</p>}
          {success && <p className="text-xs text-primary">Approval policy saved.</p>}

          <Button type="submit" size="sm" className="w-fit" disabled={pending}>
            {pending ? "Saving…" : "Save changes"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
