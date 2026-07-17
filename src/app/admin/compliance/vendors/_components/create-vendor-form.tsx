"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form-field";
import { toast } from "@/components/ui/toast";
import { createVendorAction } from "../actions";

const CATEGORY_OPTIONS = ["HOSTING", "PAYMENTS", "EMAIL_SMS", "AI_ML", "ANALYTICS", "STORAGE", "OTHER"] as const;
const RISK_OPTIONS = ["LOW", "MEDIUM", "HIGH"] as const;

export function CreateVendorForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [category, setCategory] = useState<(typeof CATEGORY_OPTIONS)[number]>("HOSTING");
  const [purpose, setPurpose] = useState("");
  const [dataProcessed, setDataProcessed] = useState("");
  const [riskLevel, setRiskLevel] = useState<(typeof RISK_OPTIONS)[number]>("MEDIUM");
  const [dpaSigned, setDpaSigned] = useState(false);
  const [dpaReference, setDpaReference] = useState("");
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await createVendorAction({
        name,
        category,
        purpose,
        dataProcessed,
        riskLevel,
        dpaSigned,
        dpaReference: dpaReference || undefined,
      });
      if (!result.ok) {
        toast.error(result.error ?? "Could not add vendor.");
        return;
      }
      toast.success("Vendor added to the register.");
      setName("");
      setPurpose("");
      setDataProcessed("");
      setDpaSigned(false);
      setDpaReference("");
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <FormField label="Vendor name" htmlFor="vendor-name" required>
          <Input id="vendor-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Amazon Web Services" required />
        </FormField>
        <FormField label="Category" htmlFor="vendor-category" required>
          <Select id="vendor-category" value={category} onChange={(e) => setCategory(e.target.value as (typeof CATEGORY_OPTIONS)[number])}>
            {CATEGORY_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt.replace(/_/g, " ")}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Risk level" htmlFor="vendor-risk" required>
          <Select id="vendor-risk" value={riskLevel} onChange={(e) => setRiskLevel(e.target.value as (typeof RISK_OPTIONS)[number])}>
            {RISK_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </Select>
        </FormField>
      </div>
      <FormField label="Purpose" htmlFor="vendor-purpose" required hint="What does this vendor do for the platform?">
        <Input id="vendor-purpose" value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="e.g. Cloud hosting for application servers" required />
      </FormField>
      <FormField label="Data processed" htmlFor="vendor-data" required hint="What personal/business data flows to this vendor?">
        <Input id="vendor-data" value={dataProcessed} onChange={(e) => setDataProcessed(e.target.value)} placeholder="e.g. User account data, IP addresses, application logs" required />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input type="checkbox" checked={dpaSigned} onChange={(e) => setDpaSigned(e.target.checked)} />
          A signed Data Processing Agreement is on file
        </label>
        <FormField label="DPA reference (optional)" htmlFor="vendor-dpa-reference" hint="Document link/ID">
          <Input id="vendor-dpa-reference" value={dpaReference} onChange={(e) => setDpaReference(e.target.value)} placeholder="e.g. legal drive link" />
        </FormField>
      </div>
      <div>
        <Button type="submit" disabled={pending || name.trim().length === 0 || purpose.trim().length === 0 || dataProcessed.trim().length === 0} size="sm">
          {pending ? "Adding…" : "Add vendor"}
        </Button>
      </div>
    </form>
  );
}
