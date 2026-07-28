"use client";

import { useState, useTransition } from "react";
import { Briefcase, ExternalLink, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ImageUploadField } from "@/components/upload/image-upload-field";
import type { CaseStudyInput } from "@/lib/validations/company";
import { updateCaseStudies } from "../actions";

export interface CaseStudiesSectionProps {
  orgId: string;
  canEdit: boolean;
  initial: CaseStudyInput[];
}

function newCaseStudy(): CaseStudyInput {
  return {
    id: crypto.randomUUID(),
    title: "",
    clientName: "",
    industry: "",
    summary: "",
    outcome: "",
    imageUrl: "",
  };
}

export function CaseStudiesSection({ orgId, canEdit, initial }: CaseStudiesSectionProps) {
  const [caseStudies, setCaseStudies] = useState<CaseStudyInput[]>(initial);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, startTransition] = useTransition();

  function update(id: string, patch: Partial<CaseStudyInput>) {
    setCaseStudies((prev) => prev.map((cs) => (cs.id === id ? { ...cs, ...patch } : cs)));
    setSuccess(false);
  }

  function remove(id: string) {
    setCaseStudies((prev) => prev.filter((cs) => cs.id !== id));
    setSuccess(false);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    startTransition(async () => {
      const result = await updateCaseStudies(orgId, caseStudies);
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
          <CardTitle>Case studies</CardTitle>
          <CardDescription>Real work you&apos;ve delivered for clients.</CardDescription>
        </CardHeader>
        <CardContent>
          {caseStudies.length === 0 ? (
            <p className="text-sm text-muted-foreground">No case studies listed yet.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {caseStudies.map((cs) => (
                <li key={cs.id} className="flex items-start gap-3 rounded-xl border border-border p-4">
                  <Briefcase className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <div className="flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-foreground">{cs.title}</p>
                      {cs.imageUrl && (
                        <a
                          href={cs.imageUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          View <ExternalLink className="size-3" />
                        </a>
                      )}
                    </div>
                    {(cs.clientName || cs.industry) && (
                      <p className="text-xs text-muted-foreground">
                        {[cs.clientName, cs.industry].filter(Boolean).join(" · ")}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-muted-foreground">{cs.summary}</p>
                    {cs.outcome && <p className="mt-1 text-xs text-muted-foreground">Outcome: {cs.outcome}</p>}
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
        <CardTitle>Case studies</CardTitle>
        <CardDescription>Real work you&apos;ve delivered for clients.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {caseStudies.length === 0 && (
            <p className="text-sm text-muted-foreground">No case studies added yet.</p>
          )}
          {caseStudies.map((cs, index) => (
            <div key={cs.id} className="flex flex-col gap-3 rounded-xl border border-border p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField label="Title" htmlFor={`cs-title-${cs.id}`} required>
                  <Input
                    id={`cs-title-${cs.id}`}
                    value={cs.title}
                    onChange={(e) => update(cs.id, { title: e.target.value })}
                    required
                  />
                </FormField>
                <FormField label="Client name" htmlFor={`cs-client-${cs.id}`}>
                  <Input
                    id={`cs-client-${cs.id}`}
                    value={cs.clientName ?? ""}
                    onChange={(e) => update(cs.id, { clientName: e.target.value })}
                  />
                </FormField>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField label="Industry" htmlFor={`cs-industry-${cs.id}`}>
                  <Input
                    id={`cs-industry-${cs.id}`}
                    value={cs.industry ?? ""}
                    onChange={(e) => update(cs.id, { industry: e.target.value })}
                  />
                </FormField>
                <FormField label="Image" htmlFor={`cs-image-${cs.id}`}>
                  <ImageUploadField
                    id={`cs-image-${cs.id}`}
                    uploadUrl={`/api/organizations/${orgId}/assets`}
                    extraFields={{ kind: "image", previousUrl: cs.imageUrl ?? "" }}
                    value={cs.imageUrl ?? ""}
                    onChange={(url) => update(cs.id, { imageUrl: url })}
                  />
                </FormField>
              </div>
              <FormField label="Summary" htmlFor={`cs-summary-${cs.id}`} required>
                <textarea
                  id={`cs-summary-${cs.id}`}
                  rows={2}
                  value={cs.summary}
                  onChange={(e) => update(cs.id, { summary: e.target.value })}
                  required
                  className="w-full rounded-lg border border-input bg-transparent px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </FormField>
              <FormField label="Outcome" htmlFor={`cs-outcome-${cs.id}`}>
                <textarea
                  id={`cs-outcome-${cs.id}`}
                  rows={2}
                  value={cs.outcome ?? ""}
                  onChange={(e) => update(cs.id, { outcome: e.target.value })}
                  className="w-full rounded-lg border border-input bg-transparent px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </FormField>
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => remove(cs.id)}
                  aria-label={`Remove case study ${index + 1}`}
                >
                  <Trash2 className="size-4" /> Remove
                </Button>
              </div>
            </div>
          ))}

          <div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setCaseStudies((prev) => [...prev, newCaseStudy()])}
            >
              <Plus className="size-4" /> Add case study
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
