"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2, Trophy } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { AwardInput } from "@/lib/validations/company";
import { updateAwards } from "../actions";

export interface AwardsSectionProps {
  orgId: string;
  canEdit: boolean;
  initial: AwardInput[];
}

function newAward(): AwardInput {
  return { id: crypto.randomUUID(), title: "", issuer: "", year: undefined, description: "" };
}

export function AwardsSection({ orgId, canEdit, initial }: AwardsSectionProps) {
  const [awards, setAwards] = useState<AwardInput[]>(initial);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, startTransition] = useTransition();

  function update(id: string, patch: Partial<AwardInput>) {
    setAwards((prev) => prev.map((award) => (award.id === id ? { ...award, ...patch } : award)));
    setSuccess(false);
  }

  function remove(id: string) {
    setAwards((prev) => prev.filter((award) => award.id !== id));
    setSuccess(false);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    startTransition(async () => {
      const result = await updateAwards(orgId, awards);
      if (!result.ok) {
        setError(result.error ?? "Something went wrong. Please try again.");
        return;
      }
      setSuccess(true);
    });
  }

  if (!canEdit) {
    return (
      <Card glass>
        <CardHeader>
          <CardTitle>Awards</CardTitle>
          <CardDescription>Recognition your organization has received.</CardDescription>
        </CardHeader>
        <CardContent>
          {awards.length === 0 ? (
            <p className="text-sm text-muted-foreground">No awards listed yet.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {awards.map((award) => (
                <li key={award.id} className="flex items-start gap-3 rounded-xl border border-border p-4">
                  <Trophy className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {award.title}
                      {award.year && <span className="ml-1 font-normal text-muted-foreground">({award.year})</span>}
                    </p>
                    {award.issuer && <p className="text-xs text-muted-foreground">{award.issuer}</p>}
                    {award.description && <p className="mt-1 text-xs text-muted-foreground">{award.description}</p>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card glass>
      <CardHeader>
        <CardTitle>Awards</CardTitle>
        <CardDescription>Recognition your organization has received.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {awards.length === 0 && <p className="text-sm text-muted-foreground">No awards added yet.</p>}
          {awards.map((award, index) => (
            <div key={award.id} className="flex flex-col gap-3 rounded-xl border border-border p-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <FormField label="Title" htmlFor={`award-title-${award.id}`} required className="sm:col-span-2">
                  <Input
                    id={`award-title-${award.id}`}
                    value={award.title}
                    onChange={(e) => update(award.id, { title: e.target.value })}
                    required
                  />
                </FormField>
                <FormField label="Year" htmlFor={`award-year-${award.id}`}>
                  <Input
                    id={`award-year-${award.id}`}
                    type="number"
                    min={1900}
                    max={2100}
                    value={award.year ?? ""}
                    onChange={(e) => update(award.id, { year: e.target.value ? Number(e.target.value) : undefined })}
                  />
                </FormField>
              </div>
              <FormField label="Issuer" htmlFor={`award-issuer-${award.id}`}>
                <Input
                  id={`award-issuer-${award.id}`}
                  value={award.issuer ?? ""}
                  onChange={(e) => update(award.id, { issuer: e.target.value })}
                />
              </FormField>
              <FormField label="Description" htmlFor={`award-description-${award.id}`}>
                <textarea
                  id={`award-description-${award.id}`}
                  rows={2}
                  value={award.description ?? ""}
                  onChange={(e) => update(award.id, { description: e.target.value })}
                  className="w-full rounded-lg border border-input bg-transparent px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </FormField>
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => remove(award.id)}
                  aria-label={`Remove award ${index + 1}`}
                >
                  <Trash2 className="size-4" /> Remove
                </Button>
              </div>
            </div>
          ))}

          <div>
            <Button type="button" variant="outline" size="sm" onClick={() => setAwards((prev) => [...prev, newAward()])}>
              <Plus className="size-4" /> Add award
            </Button>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
          {success && <p className="text-sm text-primary">Saved.</p>}

          <div className="flex justify-end">
            <Button type="submit" disabled={pending}>
              {pending ? "Saving..." : "Save changes"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
