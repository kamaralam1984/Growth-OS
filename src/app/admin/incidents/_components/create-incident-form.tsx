"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form-field";
import { toast } from "@/components/ui/toast";
import { createIncidentAction } from "../actions";

const SEVERITY_OPTIONS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;

export function CreateIncidentForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<(typeof SEVERITY_OPTIONS)[number]>("MEDIUM");
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await createIncidentAction({ title, description: description || undefined, severity });
      if (!result.ok) {
        toast.error(result.error ?? "Could not create incident.");
        return;
      }
      toast.success("Incident opened.");
      setTitle("");
      setDescription("");
      setSeverity("MEDIUM");
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <FormField label="Title" htmlFor="incident-title" required className="sm:col-span-2">
          <Input id="incident-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Payment gateway degraded" required />
        </FormField>
        <FormField label="Severity" htmlFor="incident-severity" required>
          <Select id="incident-severity" value={severity} onChange={(e) => setSeverity(e.target.value as (typeof SEVERITY_OPTIONS)[number])}>
            {SEVERITY_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </Select>
        </FormField>
      </div>
      <FormField label="Description" htmlFor="incident-description">
        <textarea
          id="incident-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="w-full rounded-lg border border-input bg-transparent px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground transition-colors duration-150 ease-[var(--ease-out-quad)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
          placeholder="What's happening, and what's the customer impact?"
        />
      </FormField>
      <div>
        <Button type="submit" disabled={pending || title.trim().length === 0} size="sm">
          {pending ? "Opening…" : "Open incident"}
        </Button>
      </div>
    </form>
  );
}
