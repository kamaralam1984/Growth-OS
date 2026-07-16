"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form-field";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createCampaign } from "../_lib/campaign-actions";

const TYPE_OPTIONS = [
  { value: "STANDARD", label: "Standard" },
  { value: "INDUSTRY", label: "Industry campaign" },
  { value: "COUNTRY", label: "Country campaign" },
  { value: "CUSTOM", label: "Custom" },
  { value: "TAG_BASED", label: "Tag-based" },
] as const;

const APPROVAL_OPTIONS = [
  { value: "MANUAL", label: "Manual approval" },
  { value: "SEMI_AUTOMATIC", label: "Semi-automatic (first email only)" },
  { value: "AUTOMATIC", label: "Automatic" },
] as const;

export function CampaignForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [type, setType] = useState<(typeof TYPE_OPTIONS)[number]["value"]>("STANDARD");
  const [targetIndustry, setTargetIndustry] = useState("");
  const [targetCountry, setTargetCountry] = useState("");
  const [goal, setGoal] = useState("");
  const [approvalMode, setApprovalMode] = useState<(typeof APPROVAL_OPTIONS)[number]["value"]>("MANUAL");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createCampaign({ name, type, targetIndustry, targetCountry, goal, approvalMode });
      if (!result.ok || !result.campaignId) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      setOpen(false);
      router.push(`/dashboard/outreach/campaigns/${result.campaignId}`);
    });
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>
        <Plus className="size-4" /> New campaign
      </Button>
    );
  }

  return (
    <Card glass className="w-full">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>New campaign</CardTitle>
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)} aria-label="Close">
          <X className="size-4" />
        </Button>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Campaign name" htmlFor="campaign-name" required className="sm:col-span-2">
            <Input id="campaign-name" value={name} onChange={(e) => setName(e.target.value)} required />
          </FormField>
          <FormField label="Type" htmlFor="campaign-type" required>
            <Select id="campaign-type" value={type} onChange={(e) => setType(e.target.value as typeof type)}>
              {TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Approval mode" htmlFor="campaign-approval" required>
            <Select id="campaign-approval" value={approvalMode} onChange={(e) => setApprovalMode(e.target.value as typeof approvalMode)}>
              {APPROVAL_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Target industry" htmlFor="campaign-industry">
            <Input id="campaign-industry" value={targetIndustry} onChange={(e) => setTargetIndustry(e.target.value)} />
          </FormField>
          <FormField label="Target country" htmlFor="campaign-country">
            <Input id="campaign-country" value={targetCountry} onChange={(e) => setTargetCountry(e.target.value)} />
          </FormField>
          <FormField label="Goal" htmlFor="campaign-goal" className="sm:col-span-2">
            <Input id="campaign-goal" value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="e.g. book 10 discovery calls this quarter" />
          </FormField>

          {error && <p className="text-sm text-destructive sm:col-span-2">{error}</p>}

          <div className="flex gap-3 sm:col-span-2">
            <Button type="submit" disabled={pending || !name.trim()}>
              {pending ? "Creating…" : "Create campaign"}
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
