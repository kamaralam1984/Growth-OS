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
import { generateProposal } from "../../actions";

const INDUSTRIES = ["SOFTWARE_DEVELOPMENT", "ERP", "CRM", "SAAS", "MOBILE_APPS", "AI_SOLUTIONS", "AUTOMATION", "CLOUD", "DEVOPS", "CONSULTING", "DIGITAL_TRANSFORMATION"] as const;
const PRICING_MODELS = ["FIXED", "HOURLY", "MONTHLY", "RETAINER", "AMC", "ENTERPRISE", "CUSTOM"] as const;

export interface GenerateProposalFormProps {
  companies: Array<{ id: string; name: string }>;
  deals: Array<{ id: string; name: string }>;
  projects: Array<{ id: string; name: string }>;
}

export function GenerateProposalForm({ companies, deals, projects }: GenerateProposalFormProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<AIErrorKind>(undefined);

  const [title, setTitle] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [dealId, setDealId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [industry, setIndustry] = useState("");
  const [pricingModel, setPricingModel] = useState("");
  const [brief, setBrief] = useState("");
  const [value, setValue] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setErrorKind(undefined);
    startTransition(async () => {
      const result = await generateProposal({
        title,
        companyId,
        dealId,
        projectId,
        brief,
        value: value ? Number(value) : undefined,
        industry: (industry || undefined) as (typeof INDUSTRIES)[number] | undefined,
        pricingModel: (pricingModel || undefined) as (typeof PRICING_MODELS)[number] | undefined,
      });
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        setErrorKind(result.errorKind);
        return;
      }
      if (result.proposalId) router.push(`/dashboard/proposal/proposals/${result.proposalId}`);
    });
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>
        <Sparkles className="size-4" />
        Generate with AI
      </Button>
    );
  }

  return (
    <Card glass className="w-full">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Generate a proposal</CardTitle>
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)} aria-label="Close">
          <X className="size-4" />
        </Button>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <FormField label="Title" htmlFor="proposal-title" required>
            <Input id="proposal-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Website redesign proposal" required />
          </FormField>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Company" htmlFor="proposal-company">
              <Select id="proposal-company" value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
                <option value="">No company</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Deal" htmlFor="proposal-deal">
              <Select id="proposal-deal" value={dealId} onChange={(e) => setDealId(e.target.value)}>
                <option value="">No deal</option>
                {deals.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Project" htmlFor="proposal-project">
              <Select id="proposal-project" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                <option value="">No project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Estimated value" htmlFor="proposal-value">
              <Input id="proposal-value" type="number" min={0} value={value} onChange={(e) => setValue(e.target.value)} />
            </FormField>
            <FormField label="Industry / domain" htmlFor="proposal-industry">
              <Select id="proposal-industry" value={industry} onChange={(e) => setIndustry(e.target.value)}>
                <option value="">Not specified</option>
                {INDUSTRIES.map((i) => (
                  <option key={i} value={i}>
                    {i.replace(/_/g, " ")}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Pricing model" htmlFor="proposal-pricing-model">
              <Select id="proposal-pricing-model" value={pricingModel} onChange={(e) => setPricingModel(e.target.value)}>
                <option value="">Not specified</option>
                {PRICING_MODELS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>
          <FormField label="Brief" htmlFor="proposal-brief" required hint="What's the scope, budget range, and goal?">
            <textarea
              id="proposal-brief"
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              rows={4}
              placeholder="Redesign their marketing site, 6-page scope, $8k budget, 4-week timeline..."
              className="w-full resize-none rounded-lg border border-input bg-transparent px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              required
            />
          </FormField>

          {error && <AiErrorBanner error={error} kind={errorKind} />}

          <div className="flex gap-3">
            <Button type="submit" disabled={pending || !title.trim() || brief.trim().length < 10}>
              {pending ? "Drafting…" : "Generate proposal"}
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
