"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form-field";
import { toast } from "@/components/ui/toast";
import { createSoAEntryAction } from "../actions";

const THEME_OPTIONS = ["ORGANIZATIONAL", "PEOPLE", "PHYSICAL", "TECHNOLOGICAL"] as const;
const STATUS_OPTIONS = ["NOT_IMPLEMENTED", "PARTIALLY_IMPLEMENTED", "IMPLEMENTED", "NOT_APPLICABLE"] as const;

export function CreateSoAEntryForm() {
  const router = useRouter();
  const [controlId, setControlId] = useState("");
  const [controlTitle, setControlTitle] = useState("");
  const [theme, setTheme] = useState<(typeof THEME_OPTIONS)[number]>("TECHNOLOGICAL");
  const [applicable, setApplicable] = useState(true);
  const [justification, setJustification] = useState("");
  const [implementationStatus, setImplementationStatus] = useState<(typeof STATUS_OPTIONS)[number]>("NOT_IMPLEMENTED");
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await createSoAEntryAction({ controlId, controlTitle, theme, applicable, justification, implementationStatus });
      if (!result.ok) {
        toast.error(result.error ?? "Could not add entry.");
        return;
      }
      toast.success("Statement of Applicability entry added.");
      setControlId("");
      setControlTitle("");
      setJustification("");
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <p className="text-xs text-muted-foreground">
        Enter the exact Annex A control id/title from your own copy of ISO/IEC 27001:2022 — this app never pre-fills
        official standard text.
      </p>
      <div className="grid gap-4 sm:grid-cols-3">
        <FormField label="Control id" htmlFor="soa-control-id" required hint="e.g. A.5.1">
          <Input id="soa-control-id" value={controlId} onChange={(e) => setControlId(e.target.value)} placeholder="A.5.1" required />
        </FormField>
        <FormField label="Control title" htmlFor="soa-control-title" required>
          <Input id="soa-control-title" value={controlTitle} onChange={(e) => setControlTitle(e.target.value)} placeholder="e.g. Policies for information security" required />
        </FormField>
        <FormField label="Theme" htmlFor="soa-theme" required>
          <Select id="soa-theme" value={theme} onChange={(e) => setTheme(e.target.value as (typeof THEME_OPTIONS)[number])}>
            {THEME_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </Select>
        </FormField>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input type="checkbox" checked={applicable} onChange={(e) => setApplicable(e.target.checked)} />
          Applicable to this organization
        </label>
        <FormField label="Implementation status" htmlFor="soa-implementation-status" required>
          <Select id="soa-implementation-status" value={implementationStatus} onChange={(e) => setImplementationStatus(e.target.value as (typeof STATUS_OPTIONS)[number])}>
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt.replace(/_/g, " ")}
              </option>
            ))}
          </Select>
        </FormField>
      </div>
      <FormField label="Justification" htmlFor="soa-justification" required hint="Why is this control applicable/not applicable, and how is it implemented?">
        <textarea
          id="soa-justification"
          value={justification}
          onChange={(e) => setJustification(e.target.value)}
          rows={3}
          className="w-full rounded-lg border border-input bg-transparent px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground transition-colors duration-150 ease-[var(--ease-out-quad)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
          required
        />
      </FormField>
      <div>
        <Button type="submit" disabled={pending || controlId.trim().length === 0 || controlTitle.trim().length === 0 || justification.trim().length === 0} size="sm">
          {pending ? "Adding…" : "Add entry"}
        </Button>
      </div>
    </form>
  );
}
