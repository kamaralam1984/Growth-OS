"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form-field";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AiErrorBanner, type AIErrorKind } from "@/app/board/_components/ai-error-banner";
import { generateBusinessDocumentAction } from "../../_lib/business-document-actions";

const KINDS = [
  { value: "NDA", label: "NDA" },
  { value: "MSA", label: "MSA" },
  { value: "SLA", label: "SLA" },
  { value: "TERMS", label: "Terms & Conditions" },
  { value: "PRIVACY_AGREEMENT", label: "Privacy Agreement" },
  { value: "ACCEPTANCE_LETTER", label: "Acceptance Letter" },
  { value: "DELIVERY_CERTIFICATE", label: "Delivery Certificate" },
  { value: "SCOPE_OF_WORK", label: "Scope of Work" },
  { value: "REQUIREMENT_SPECIFICATION", label: "Requirement Specification" },
  { value: "TECHNICAL_ARCHITECTURE", label: "Technical Architecture" },
  { value: "PROJECT_ROADMAP", label: "Project Roadmap" },
  { value: "RISK_REGISTER", label: "Risk Register" },
  { value: "ACCEPTANCE_CRITERIA", label: "Acceptance Criteria" },
  { value: "PROJECT_PLAN", label: "Project Plan" },
  { value: "BUSINESS_REPORT", label: "Business Report" },
] as const;

export interface BusinessDocumentFormProps {
  companies: Array<{ id: string; name: string }>;
  deals: Array<{ id: string; name: string }>;
  projects: Array<{ id: string; name: string }>;
}

export function BusinessDocumentForm({ companies, deals, projects }: BusinessDocumentFormProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<AIErrorKind>(undefined);

  const [kind, setKind] = useState<(typeof KINDS)[number]["value"]>("NDA");
  const [companyId, setCompanyId] = useState("");
  const [dealId, setDealId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [counterpartyName, setCounterpartyName] = useState("");
  const [brief, setBrief] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setErrorKind(undefined);
    startTransition(async () => {
      const result = await generateBusinessDocumentAction({ kind, companyId, dealId, projectId, counterpartyName, brief });
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        setErrorKind(result.errorKind);
        return;
      }
      if (result.documentId) router.push(`/dashboard/proposal/documents/${result.documentId}`);
    });
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>
        <Sparkles className="size-4" /> Generate with AI
      </Button>
    );
  }

  return (
    <Card glass className="w-full">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Generate a document</CardTitle>
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)} aria-label="Close">
          <X className="size-4" />
        </Button>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Document type" htmlFor="bizdoc-kind" required>
              <Select id="bizdoc-kind" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
                {KINDS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Counterparty / recipient name" htmlFor="bizdoc-counterparty">
              <Input id="bizdoc-counterparty" value={counterpartyName} onChange={(e) => setCounterpartyName(e.target.value)} />
            </FormField>
            <FormField label="Company" htmlFor="bizdoc-company">
              <Select id="bizdoc-company" value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
                <option value="">No company</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Deal" htmlFor="bizdoc-deal">
              <Select id="bizdoc-deal" value={dealId} onChange={(e) => setDealId(e.target.value)}>
                <option value="">No deal</option>
                {deals.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Project" htmlFor="bizdoc-project">
              <Select id="bizdoc-project" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                <option value="">No project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>
          <FormField label="Brief" htmlFor="bizdoc-brief" required hint="What should this document cover?">
            <textarea
              id="bizdoc-brief"
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              rows={4}
              className="w-full resize-none rounded-lg border border-input bg-transparent px-3.5 py-2.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              required
            />
          </FormField>

          {error && <AiErrorBanner error={error} kind={errorKind} />}

          <div className="flex gap-3">
            <Button type="submit" disabled={pending || brief.trim().length < 10}>
              {pending ? "Drafting…" : "Generate document"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
