"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form-field";
import { toast } from "@/components/ui/toast";
import { createChangeRequestAction } from "../actions";

const TYPE_OPTIONS = ["FEATURE", "BUGFIX", "INFRASTRUCTURE", "SECURITY", "CONFIGURATION", "EMERGENCY"] as const;
const RISK_OPTIONS = ["LOW", "MEDIUM", "HIGH"] as const;

export function CreateChangeRequestForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [changeType, setChangeType] = useState<(typeof TYPE_OPTIONS)[number]>("FEATURE");
  const [riskLevel, setRiskLevel] = useState<(typeof RISK_OPTIONS)[number]>("LOW");
  const [rollbackPlan, setRollbackPlan] = useState("");
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await createChangeRequestAction({ title, description, changeType, riskLevel, rollbackPlan: rollbackPlan || undefined });
      if (!result.ok) {
        toast.error(result.error ?? "Could not create change request.");
        return;
      }
      toast.success("Change request proposed.");
      setTitle("");
      setDescription("");
      setRollbackPlan("");
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <FormField label="Title" htmlFor="change-title" required>
          <Input id="change-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Migrate billing webhook to v2" required />
        </FormField>
        <FormField label="Type" htmlFor="change-type" required>
          <Select id="change-type" value={changeType} onChange={(e) => setChangeType(e.target.value as (typeof TYPE_OPTIONS)[number])}>
            {TYPE_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Risk level" htmlFor="change-risk" required>
          <Select id="change-risk" value={riskLevel} onChange={(e) => setRiskLevel(e.target.value as (typeof RISK_OPTIONS)[number])}>
            {RISK_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </Select>
        </FormField>
      </div>
      <FormField label="Description" htmlFor="change-description" required>
        <textarea
          id="change-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="w-full rounded-lg border border-input bg-transparent px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground transition-colors duration-150 ease-[var(--ease-out-quad)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
          placeholder="What's changing, and why?"
          required
        />
      </FormField>
      <FormField label="Rollback plan (optional)" htmlFor="change-rollback">
        <textarea
          id="change-rollback"
          value={rollbackPlan}
          onChange={(e) => setRollbackPlan(e.target.value)}
          rows={2}
          className="w-full rounded-lg border border-input bg-transparent px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground transition-colors duration-150 ease-[var(--ease-out-quad)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
          placeholder="How would this be reverted if it goes wrong?"
        />
      </FormField>
      <div>
        <Button type="submit" disabled={pending || title.trim().length === 0 || description.trim().length === 0} size="sm">
          {pending ? "Proposing…" : "Propose change"}
        </Button>
      </div>
    </form>
  );
}
