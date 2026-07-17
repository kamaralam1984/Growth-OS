"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form-field";
import { toast } from "@/components/ui/toast";
import { createPolicyAction } from "../actions";

const CATEGORY_OPTIONS = [
  "ACCESS_CONTROL",
  "DATA_PROTECTION",
  "INCIDENT_RESPONSE",
  "BUSINESS_CONTINUITY",
  "ACCEPTABLE_USE",
  "VENDOR_MANAGEMENT",
  "CHANGE_MANAGEMENT",
  "RISK_MANAGEMENT",
  "OTHER",
] as const;

export function CreatePolicyForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<(typeof CATEGORY_OPTIONS)[number]>("DATA_PROTECTION");
  const [content, setContent] = useState("");
  const [reviewDueAt, setReviewDueAt] = useState("");
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await createPolicyAction({ title, category, content, reviewDueAt: reviewDueAt || undefined });
      if (!result.ok) {
        toast.error(result.error ?? "Could not create policy.");
        return;
      }
      toast.success("Policy created as a draft.");
      setTitle("");
      setContent("");
      setReviewDueAt("");
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Title" htmlFor="policy-title" required>
          <Input id="policy-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Access Control Policy" required />
        </FormField>
        <FormField label="Category" htmlFor="policy-category" required>
          <Select id="policy-category" value={category} onChange={(e) => setCategory(e.target.value as (typeof CATEGORY_OPTIONS)[number])}>
            {CATEGORY_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt.replace(/_/g, " ")}
              </option>
            ))}
          </Select>
        </FormField>
      </div>
      <FormField label="Policy content" htmlFor="policy-content" required>
        <textarea
          id="policy-content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={6}
          className="w-full rounded-lg border border-input bg-transparent px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground transition-colors duration-150 ease-[var(--ease-out-quad)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
          placeholder="Write the real policy text — scope, requirements, enforcement."
          required
        />
      </FormField>
      <FormField label="Next review due (optional)" htmlFor="policy-review-due">
        <Input id="policy-review-due" type="date" value={reviewDueAt} onChange={(e) => setReviewDueAt(e.target.value)} />
      </FormField>
      <div>
        <Button type="submit" disabled={pending || title.trim().length === 0 || content.trim().length === 0} size="sm">
          {pending ? "Creating…" : "Create draft"}
        </Button>
      </div>
    </form>
  );
}
