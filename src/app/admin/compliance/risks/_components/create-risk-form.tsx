"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form-field";
import { toast } from "@/components/ui/toast";
import { createSecurityRiskAction } from "../actions";

const CATEGORY_OPTIONS = ["DATA_SECURITY", "ACCESS_CONTROL", "THIRD_PARTY", "AVAILABILITY", "COMPLIANCE", "OPERATIONAL"] as const;
const SCALE_OPTIONS = [1, 2, 3, 4, 5] as const;

export function CreateRiskForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<(typeof CATEGORY_OPTIONS)[number]>("DATA_SECURITY");
  const [likelihood, setLikelihood] = useState(3);
  const [impact, setImpact] = useState(3);
  const [mitigationPlan, setMitigationPlan] = useState("");
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await createSecurityRiskAction({ title, description, category, likelihood, impact, mitigationPlan: mitigationPlan || undefined });
      if (!result.ok) {
        toast.error(result.error ?? "Could not add risk.");
        return;
      }
      toast.success("Risk added to the register.");
      setTitle("");
      setDescription("");
      setMitigationPlan("");
      setLikelihood(3);
      setImpact(3);
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Title" htmlFor="risk-title" required>
          <Input id="risk-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Unrotated third-party API keys" required />
        </FormField>
        <FormField label="Category" htmlFor="risk-category" required>
          <Select id="risk-category" value={category} onChange={(e) => setCategory(e.target.value as (typeof CATEGORY_OPTIONS)[number])}>
            {CATEGORY_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt.replace(/_/g, " ")}
              </option>
            ))}
          </Select>
        </FormField>
      </div>
      <FormField label="Description" htmlFor="risk-description" required>
        <textarea
          id="risk-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="w-full rounded-lg border border-input bg-transparent px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground transition-colors duration-150 ease-[var(--ease-out-quad)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
          placeholder="What's the risk, and what's the real-world impact if it materializes?"
          required
        />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Likelihood (1-5)" htmlFor="risk-likelihood" required hint="1 = rare, 5 = almost certain">
          <Select id="risk-likelihood" value={String(likelihood)} onChange={(e) => setLikelihood(Number(e.target.value))}>
            {SCALE_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Impact (1-5)" htmlFor="risk-impact" required hint="1 = negligible, 5 = severe">
          <Select id="risk-impact" value={String(impact)} onChange={(e) => setImpact(Number(e.target.value))}>
            {SCALE_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Select>
        </FormField>
      </div>
      <FormField label="Mitigation plan (optional)" htmlFor="risk-mitigation">
        <textarea
          id="risk-mitigation"
          value={mitigationPlan}
          onChange={(e) => setMitigationPlan(e.target.value)}
          rows={2}
          className="w-full rounded-lg border border-input bg-transparent px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground transition-colors duration-150 ease-[var(--ease-out-quad)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
          placeholder="What's the plan to reduce this risk?"
        />
      </FormField>
      <div>
        <Button type="submit" disabled={pending || title.trim().length === 0 || description.trim().length === 0} size="sm">
          {pending ? "Adding…" : "Add to register"}
        </Button>
      </div>
    </form>
  );
}
