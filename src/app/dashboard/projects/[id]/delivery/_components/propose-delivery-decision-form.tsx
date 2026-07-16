"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AiErrorBanner } from "@/app/board/_components/ai-error-banner";
import { proposeDeliveryDecision, type ActionResult } from "../actions";

interface DecisionFormState {
  topic: string;
  description: string;
}

const EMPTY: DecisionFormState = { topic: "", description: "" };

/** Forked from War Room's ProposeDecisionForm — deliberately does not auto-vote on submit (proposeDeliveryDecision only creates the Decision); a separate "Run final vote" action on the decision card triggers the real vote, matching the Review Board's discuss-first flow. */
export function ProposeDeliveryDecisionForm({ meetingId }: { meetingId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<DecisionFormState>(EMPTY);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  function set<K extends keyof DecisionFormState>(key: K, value: DecisionFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setResult(null);
    startTransition(async () => {
      const res = await proposeDeliveryDecision(meetingId, { topic: form.topic, description: form.description, category: "PROJECT_DELIVERY" });
      setResult(res);
      if (res.ok) {
        setForm(EMPTY);
        setOpen(false);
        router.refresh();
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
        <CardDescription>The board will discuss it first — run the final vote separately from the decision card once you&apos;re ready.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <FormField label="Topic" htmlFor="delivery-decision-topic" required>
            <Input
              id="delivery-decision-topic"
              value={form.topic}
              onChange={(e) => set("topic", e.target.value)}
              placeholder="Delay the release by 3 days to fix critical bugs"
              required
            />
          </FormField>
          <FormField label="Description" htmlFor="delivery-decision-description">
            <textarea
              id="delivery-decision-description"
              value={form.description}
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
              {pending ? "Proposing…" : "Propose decision"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
