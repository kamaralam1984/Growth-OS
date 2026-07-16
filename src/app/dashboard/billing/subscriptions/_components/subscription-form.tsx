"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form-field";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createSubscription, updateSubscription } from "../actions";
import type { SubscriptionBillingCycleInput, SubscriptionStatusInput } from "@/lib/validations/subscription";

const BILLING_CYCLES: SubscriptionBillingCycleInput[] = ["MONTHLY", "QUARTERLY", "YEARLY"];
const STATUSES: SubscriptionStatusInput[] = ["TRIALING", "ACTIVE", "PAUSED", "CANCELLED", "EXPIRED"];

function toDateInputValue(date: Date | null | undefined): string {
  if (!date) return "";
  return new Date(date).toISOString().slice(0, 10);
}

export interface SubscriptionFormInitial {
  id: string;
  name: string;
  companyId: string | null;
  clientId: string | null;
  amount: number;
  currency: string | null;
  billingCycle: SubscriptionBillingCycleInput;
  status: SubscriptionStatusInput;
  startDate: Date;
  renewalDate: Date | null;
  notes: string | null;
}

export interface SubscriptionFormProps {
  companies: Array<{ id: string; name: string }>;
  clients: Array<{ id: string; name: string }>;
  currency?: string | null;
  initial?: SubscriptionFormInitial;
  trigger?: React.ReactNode;
}

export function SubscriptionForm({ companies, clients, currency, initial, trigger }: SubscriptionFormProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(initial?.name ?? "");
  const [companyId, setCompanyId] = useState(initial?.companyId ?? "");
  const [clientId, setClientId] = useState(initial?.clientId ?? "");
  const [amount, setAmount] = useState(initial ? String(initial.amount) : "");
  const [subCurrency, setSubCurrency] = useState(initial?.currency ?? currency ?? "");
  const [billingCycle, setBillingCycle] = useState<SubscriptionBillingCycleInput>(initial?.billingCycle ?? "MONTHLY");
  const [status, setStatus] = useState<SubscriptionStatusInput>(initial?.status ?? "ACTIVE");
  const [startDate, setStartDate] = useState(toDateInputValue(initial?.startDate) || toDateInputValue(new Date()));
  const [renewalDate, setRenewalDate] = useState(toDateInputValue(initial?.renewalDate));
  const [notes, setNotes] = useState(initial?.notes ?? "");

  const isEdit = !!initial;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const input = {
        name,
        companyId,
        clientId,
        amount: Number(amount) || 0,
        currency: subCurrency,
        billingCycle,
        status,
        startDate: startDate ? new Date(startDate) : new Date(),
        renewalDate: renewalDate ? new Date(renewalDate) : undefined,
        notes,
      };
      const result = isEdit ? await updateSubscription(initial.id, input) : await createSubscription(input);
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} variant={isEdit ? "outline" : "default"} size={isEdit ? "sm" : "md"}>
        {trigger ?? (
          <>
            <Plus className="size-4" /> New Subscription
          </>
        )}
      </Button>
    );
  }

  return (
    <Card glass className="w-full">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>{isEdit ? "Edit subscription" : "New subscription"}</CardTitle>
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)} aria-label="Close">
          <X className="size-4" />
        </Button>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <FormField label="Name" htmlFor="sub-name" required>
              <Input id="sub-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Acme Corp — Retainer" required />
            </FormField>
            <FormField label="Company" htmlFor="sub-company">
              <Select id="sub-company" value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
                <option value="">No company</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Client" htmlFor="sub-client">
              <Select id="sub-client" value={clientId} onChange={(e) => setClientId(e.target.value)}>
                <option value="">No client</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <FormField label="Amount" htmlFor="sub-amount" required>
              <Input id="sub-amount" type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
            </FormField>
            <FormField label="Currency" htmlFor="sub-currency">
              <Input id="sub-currency" value={subCurrency} onChange={(e) => setSubCurrency(e.target.value)} placeholder={currency ?? "USD"} maxLength={10} />
            </FormField>
            <FormField label="Billing cycle" htmlFor="sub-cycle" required>
              <Select id="sub-cycle" value={billingCycle} onChange={(e) => setBillingCycle(e.target.value as SubscriptionBillingCycleInput)}>
                {BILLING_CYCLES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Status" htmlFor="sub-status" required>
              <Select id="sub-status" value={status} onChange={(e) => setStatus(e.target.value as SubscriptionStatusInput)}>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Start date" htmlFor="sub-start" required>
              <Input id="sub-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
            </FormField>
            <FormField label="Renewal date" htmlFor="sub-renewal">
              <Input id="sub-renewal" type="date" value={renewalDate} onChange={(e) => setRenewalDate(e.target.value)} />
            </FormField>
          </div>

          <FormField label="Notes" htmlFor="sub-notes">
            <textarea
              id="sub-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full resize-none rounded-lg border border-input bg-transparent px-3.5 py-2.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </FormField>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex gap-3">
            <Button type="submit" disabled={pending || !name.trim() || !amount}>
              {pending ? "Saving…" : isEdit ? "Save changes" : "Create subscription"}
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
