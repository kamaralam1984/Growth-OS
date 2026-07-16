"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form-field";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createWorkflowAction } from "../actions";
import type { WorkflowTriggerTypeInput } from "@/lib/validations/workflows";

const TRIGGER_OPTIONS: Array<{ value: WorkflowTriggerTypeInput; label: string }> = [
  { value: "LEAD_CREATED", label: "A new lead is created" },
  { value: "LEAD_UPDATED", label: "A lead is updated" },
  { value: "TASK_COMPLETED", label: "A task is completed" },
  { value: "TASK_OVERDUE", label: "A task becomes overdue" },
  { value: "MEETING_ENDED", label: "A meeting ends" },
  { value: "MEETING_SCHEDULED", label: "A meeting is scheduled" },
  { value: "DECISION_MADE", label: "A decision is finalized" },
  { value: "DEAL_STAGE_CHANGED", label: "A deal changes stage" },
  { value: "DEAL_WON", label: "A deal is won" },
  { value: "DEAL_LOST", label: "A deal is lost" },
  { value: "PROPOSAL_ACCEPTED", label: "A proposal is accepted" },
  { value: "PROPOSAL_REJECTED", label: "A proposal is rejected" },
  { value: "CONTRACT_SIGNED", label: "A contract is signed" },
  { value: "INVOICE_PAID", label: "An invoice is paid" },
  { value: "INVOICE_OVERDUE", label: "An invoice becomes overdue" },
  { value: "PROJECT_CREATED", label: "A project is created" },
  { value: "CLIENT_MESSAGE", label: "A client sends a message" },
  { value: "WEBHOOK_RECEIVED", label: "A webhook is received" },
  { value: "TIMER", label: "A timer elapses" },
  { value: "CRON", label: "On a schedule (cron)" },
  { value: "MANUAL", label: "Run manually" },
];

export function WorkflowForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [triggerType, setTriggerType] = useState<WorkflowTriggerTypeInput>("MANUAL");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await createWorkflowAction({ name, description, triggerType });
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      setName("");
      setDescription("");
      setOpen(false);
      if (result.workflowId) router.push(`/admin/automation/${result.workflowId}`);
      else router.refresh();
    });
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>
        <Plus className="size-4" />
        New workflow
      </Button>
    );
  }

  return (
    <Card glass className="w-full">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>New workflow</CardTitle>
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)} aria-label="Close">
          <X className="size-4" />
        </Button>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Workflow name" htmlFor="workflow-name" required className="sm:col-span-2">
            <Input id="workflow-name" value={name} onChange={(e) => setName(e.target.value)} required />
          </FormField>
          <FormField label="Description" htmlFor="workflow-description" className="sm:col-span-2">
            <Input id="workflow-description" value={description} onChange={(e) => setDescription(e.target.value)} />
          </FormField>
          <FormField label="Trigger" htmlFor="workflow-trigger" required className="sm:col-span-2">
            <Select id="workflow-trigger" value={triggerType} onChange={(e) => setTriggerType(e.target.value as WorkflowTriggerTypeInput)}>
              {TRIGGER_OPTIONS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          </FormField>

          {error && <p className="text-sm text-destructive sm:col-span-2">{error}</p>}

          <div className="flex gap-3 sm:col-span-2">
            <Button type="submit" disabled={pending || !name.trim()}>
              {pending ? "Creating…" : "Create workflow"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
