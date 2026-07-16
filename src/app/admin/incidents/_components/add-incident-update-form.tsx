"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form-field";
import { toast } from "@/components/ui/toast";
import { addIncidentUpdateAction } from "../actions";

const STATUS_OPTIONS = ["OPEN", "INVESTIGATING", "MONITORING", "RESOLVED"] as const;

export function AddIncidentUpdateForm({ incidentId, currentStatus }: { incidentId: string; currentStatus: string }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<(typeof STATUS_OPTIONS)[number]>(
    (currentStatus as (typeof STATUS_OPTIONS)[number]) ?? "INVESTIGATING",
  );
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await addIncidentUpdateAction({ incidentId, message, status });
      if (!result.ok) {
        toast.error(result.error ?? "Could not add update.");
        return;
      }
      toast.success("Update added.");
      setMessage("");
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <FormField label="Status" htmlFor="update-status" required>
        <Select id="update-status" value={status} onChange={(e) => setStatus(e.target.value as (typeof STATUS_OPTIONS)[number])}>
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </Select>
      </FormField>
      <FormField label="Update message" htmlFor="update-message" required>
        <textarea
          id="update-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={3}
          className="w-full rounded-lg border border-input bg-transparent px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground transition-colors duration-150 ease-[var(--ease-out-quad)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
          placeholder="What changed since the last update?"
          required
        />
      </FormField>
      <div>
        <Button type="submit" disabled={pending || message.trim().length === 0} size="sm">
          {pending ? "Adding…" : "Add update"}
        </Button>
      </div>
    </form>
  );
}
