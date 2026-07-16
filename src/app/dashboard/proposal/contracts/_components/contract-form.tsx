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
import { generateContract } from "../../_lib/contract-actions";

const CONTRACT_TYPES = [
  { value: "SOFTWARE_DEVELOPMENT_AGREEMENT", label: "Software Development Agreement" },
  { value: "AMC_AGREEMENT", label: "AMC Agreement" },
  { value: "MAINTENANCE_AGREEMENT", label: "Maintenance Agreement" },
  { value: "SUPPORT_AGREEMENT", label: "Support Agreement" },
  { value: "IMPLEMENTATION_AGREEMENT", label: "Implementation Agreement" },
  { value: "CONSULTING_AGREEMENT", label: "Consulting Agreement" },
] as const;

export interface ContractFormProps {
  companies: Array<{ id: string; name: string }>;
  deals: Array<{ id: string; name: string }>;
  clients: Array<{ id: string; name: string }>;
}

export function ContractForm({ companies, deals, clients }: ContractFormProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<AIErrorKind>(undefined);

  const [title, setTitle] = useState("");
  const [type, setType] = useState<(typeof CONTRACT_TYPES)[number]["value"]>("SOFTWARE_DEVELOPMENT_AGREEMENT");
  const [companyId, setCompanyId] = useState("");
  const [dealId, setDealId] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientName, setClientName] = useState("");
  const [value, setValue] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [brief, setBrief] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setErrorKind(undefined);
    startTransition(async () => {
      const result = await generateContract({
        title,
        type,
        companyId,
        dealId,
        clientId,
        clientName,
        value: value ? Number(value) : undefined,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        brief,
      });
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        setErrorKind(result.errorKind);
        return;
      }
      if (result.contractId) router.push(`/dashboard/proposal/contracts/${result.contractId}`);
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
        <CardTitle>Generate a contract</CardTitle>
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)} aria-label="Close">
          <X className="size-4" />
        </Button>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Title" htmlFor="contract-title" required>
              <Input id="contract-title" value={title} onChange={(e) => setTitle(e.target.value)} required />
            </FormField>
            <FormField label="Contract type" htmlFor="contract-type" required>
              <Select id="contract-type" value={type} onChange={(e) => setType(e.target.value as typeof type)}>
                {CONTRACT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Other party (client) name" htmlFor="contract-client-name" required>
              <Input id="contract-client-name" value={clientName} onChange={(e) => setClientName(e.target.value)} required />
            </FormField>
            <FormField label="Existing client record" htmlFor="contract-client">
              <Select id="contract-client" value={clientId} onChange={(e) => setClientId(e.target.value)}>
                <option value="">None</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Company" htmlFor="contract-company">
              <Select id="contract-company" value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
                <option value="">No company</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Deal" htmlFor="contract-deal">
              <Select id="contract-deal" value={dealId} onChange={(e) => setDealId(e.target.value)}>
                <option value="">No deal</option>
                {deals.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Value" htmlFor="contract-value">
              <Input id="contract-value" type="number" min={0} value={value} onChange={(e) => setValue(e.target.value)} />
            </FormField>
            <FormField label="Start date" htmlFor="contract-start">
              <Input id="contract-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </FormField>
            <FormField label="End date" htmlFor="contract-end">
              <Input id="contract-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </FormField>
          </div>
          <FormField label="Brief" htmlFor="contract-brief" required hint="Scope, key obligations, anything specific this contract must cover.">
            <textarea
              id="contract-brief"
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              rows={4}
              className="w-full resize-none rounded-lg border border-input bg-transparent px-3.5 py-2.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              required
            />
          </FormField>

          {error && <AiErrorBanner error={error} kind={errorKind} />}

          <div className="flex gap-3">
            <Button type="submit" disabled={pending || !title.trim() || !clientName.trim() || brief.trim().length < 10}>
              {pending ? "Drafting…" : "Generate contract"}
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
