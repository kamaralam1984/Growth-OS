"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form-field";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AiErrorBanner } from "@/app/board/_components/ai-error-banner";
import { DECISION_CATEGORY_LABEL } from "@/lib/decision-category";
import type { CreateDecisionInput } from "@/lib/validations/board";
import { proposeDecision, type ActionResult } from "../actions";

const EMPTY: CreateDecisionInput = { topic: "", description: "", category: "GENERAL" };

export function ProposeDecisionForm({ meetingId }: { meetingId: string }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<CreateDecisionInput>(EMPTY);
  // Kept as a plain string, not merged into `form`, since CreateDecisionInput
  // coerces this field from unknown — a controlled <input> needs a stable
  // string value, converted to a real number (or omitted) on submit.
  const [financialImpact, setFinancialImpact] = useState("");
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  function set<K extends keyof CreateDecisionInput>(key: K, value: CreateDecisionInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setResult(null);
    startTransition(async () => {
      const res = await proposeDecision(meetingId, {
        ...form,
        financialImpact: financialImpact.trim() ? Number(financialImpact) : undefined,
      });
      setResult(res);
      if (res.ok) {
        setForm(EMPTY);
        setFinancialImpact("");
        setOpen(false);
      }
    });
  }

  if (!open) {
    return (
      <div className="flex flex-col gap-2">
        <Button variant="outline" onClick={() => setOpen(true)}>
          Propose a decision
        </Button>
        {result && !result.ok && <AiErrorBanner error={result.error ?? "Something went wrong."} kind={result.errorKind} />}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Propose a decision</CardTitle>
        <CardDescription>Every active executive agent will cast a real, independent vote on this.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <FormField label="Topic" htmlFor="decision-topic" required>
            <Input
              id="decision-topic"
              value={form.topic}
              onChange={(e) => set("topic", e.target.value)}
              placeholder="Approve the Q3 outbound budget increase"
              required
            />
          </FormField>
          <FormField label="Category" htmlFor="decision-category" required>
            <Select
              id="decision-category"
              value={form.category ?? "GENERAL"}
              onChange={(e) => set("category", e.target.value as CreateDecisionInput["category"])}
            >
              {Object.entries(DECISION_CATEGORY_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Financial impact (optional)" htmlFor="decision-financial-impact">
            <Input
              id="decision-financial-impact"
              type="number"
              min="0"
              step="0.01"
              value={financialImpact}
              onChange={(e) => setFinancialImpact(e.target.value)}
              placeholder="e.g. 250000 — high-value decisions get flagged HIGH risk automatically"
            />
          </FormField>
          <FormField label="Description" htmlFor="decision-description">
            <textarea
              id="decision-description"
              value={form.description ?? ""}
              onChange={(e) => set("description", e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-input bg-transparent px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground transition-colors duration-150 ease-[var(--ease-out-quad)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </FormField>

          {result && !result.ok && <AiErrorBanner error={result.error ?? "Something went wrong."} kind={result.errorKind} />}

          <div className="flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !form.topic.trim()}>
              {pending ? "Voting..." : "Propose & vote now"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
