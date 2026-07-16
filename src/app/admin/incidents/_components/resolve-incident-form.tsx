"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { toast } from "@/components/ui/toast";
import { resolveIncidentAction } from "../actions";

export function ResolveIncidentForm({ incidentId }: { incidentId: string }) {
  const router = useRouter();
  const [postmortem, setPostmortem] = useState("");
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await resolveIncidentAction({ incidentId, postmortem: postmortem || undefined });
      if (!result.ok) {
        toast.error(result.error ?? "Could not resolve incident.");
        return;
      }
      toast.success("Incident resolved.");
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <FormField label="Postmortem" htmlFor="resolve-postmortem">
        <textarea
          id="resolve-postmortem"
          value={postmortem}
          onChange={(e) => setPostmortem(e.target.value)}
          rows={4}
          className="w-full rounded-lg border border-input bg-transparent px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground transition-colors duration-150 ease-[var(--ease-out-quad)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
          placeholder="Root cause, impact, and follow-up actions (optional)."
        />
      </FormField>
      <div>
        <Button type="submit" disabled={pending} variant="outline" size="sm">
          {pending ? "Resolving…" : "Resolve incident"}
        </Button>
      </div>
    </form>
  );
}
