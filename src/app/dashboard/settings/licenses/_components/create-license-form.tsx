"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form-field";
import { toast } from "@/components/ui/toast";
import { generateLicenseAction } from "../actions";

const TYPE_OPTIONS = [
  { value: "API", label: "API" },
  { value: "SEAT", label: "Seat" },
  { value: "ENTERPRISE", label: "Enterprise" },
] as const;

export interface CreateLicenseFormProps {
  onCreated?: () => void;
}

/** Issues a license and hands the raw key back to the caller exactly once via `onCreated`'s companion reveal dialog in the parent — this form never persists the key in its own state past the single toast/callback round trip. */
export function CreateLicenseForm({ onCreated }: CreateLicenseFormProps) {
  const [type, setType] = useState<(typeof TYPE_OPTIONS)[number]["value"]>("API");
  const [seats, setSeats] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await generateLicenseAction({
        type,
        seats: type === "SEAT" && seats ? Number(seats) : undefined,
        expiresAt: expiresAt || undefined,
      });
      if (!result.ok) {
        setError(result.error ?? "Could not generate this license.");
        toast.error(result.error ?? "Could not generate this license.");
        return;
      }
      toast.success(`License generated: ${result.key}`);
      setSeats("");
      setExpiresAt("");
      onCreated?.();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <FormField label="Type" htmlFor="licenseType" required>
          <Select id="licenseType" value={type} onChange={(e) => setType(e.target.value as (typeof TYPE_OPTIONS)[number]["value"])}>
            {TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Seats" htmlFor="licenseSeats" hint="Only used for Seat licenses.">
          <Input
            id="licenseSeats"
            type="number"
            min={1}
            value={seats}
            onChange={(e) => setSeats(e.target.value)}
            placeholder="e.g. 10"
            disabled={type !== "SEAT"}
          />
        </FormField>
        <FormField label="Expires" htmlFor="licenseExpiresAt">
          <Input id="licenseExpiresAt" type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
        </FormField>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Generating..." : "Generate license"}
      </Button>
    </form>
  );
}
