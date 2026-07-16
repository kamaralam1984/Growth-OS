"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form-field";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LineItemsEditor, type LineItemRow } from "../../_components/line-items-editor";
import { createInvoice } from "../../_lib/invoice-actions";

const INVOICE_TYPES = [
  { value: "STANDARD", label: "Invoice" },
  { value: "GST", label: "GST Invoice" },
  { value: "RECURRING", label: "Recurring Invoice" },
  { value: "PROFORMA", label: "Proforma Invoice" },
  { value: "CREDIT_NOTE", label: "Credit Note" },
  { value: "DEBIT_NOTE", label: "Debit Note" },
] as const;
const RECURRENCE_RULES = ["DAILY", "WEEKLY", "MONTHLY", "YEARLY"] as const;

export interface InvoiceFormProps {
  companies: Array<{ id: string; name: string }>;
  deals: Array<{ id: string; name: string }>;
  clients: Array<{ id: string; name: string }>;
  currency?: string | null;
}

export function InvoiceForm({ companies, deals, clients, currency }: InvoiceFormProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [type, setType] = useState<(typeof INVOICE_TYPES)[number]["value"]>("STANDARD");
  const [companyId, setCompanyId] = useState("");
  const [dealId, setDealId] = useState("");
  const [clientId, setClientId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [discountPercent, setDiscountPercent] = useState("");
  const [taxPercent, setTaxPercent] = useState("");
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceRule, setRecurrenceRule] = useState<(typeof RECURRENCE_RULES)[number]>("MONTHLY");
  const [notes, setNotes] = useState("");
  const [terms, setTerms] = useState("");
  const [items, setItems] = useState<LineItemRow[]>([{ description: "", quantity: "1", rate: "0" }]);

  const totals = useMemo(() => {
    const lineAmounts = items.map((i) => (Number(i.quantity) || 0) * (Number(i.rate) || 0));
    const subtotal = lineAmounts.reduce((a, b) => a + b, 0);
    const discountAmount = discountPercent ? subtotal * (Number(discountPercent) / 100) : 0;
    const afterDiscount = subtotal - discountAmount;
    const taxAmount = taxPercent ? afterDiscount * (Number(taxPercent) / 100) : 0;
    return { subtotal, discountAmount, taxAmount, grandTotal: afterDiscount + taxAmount };
  }, [items, discountPercent, taxPercent]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createInvoice({
        type,
        companyId,
        dealId,
        clientId,
        dueDate: dueDate ? new Date(dueDate) : undefined,
        discountPercent: discountPercent ? Number(discountPercent) : undefined,
        taxPercent: taxPercent ? Number(taxPercent) : undefined,
        isRecurring,
        recurrenceRule: isRecurring ? recurrenceRule : undefined,
        notes,
        terms,
        lineItems: items.filter((i) => i.description.trim()).map((i) => ({ description: i.description, quantity: Number(i.quantity) || 0, rate: Number(i.rate) || 0 })),
      });
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      if (result.invoiceId) router.push(`/dashboard/proposal/invoices/${result.invoiceId}`);
    });
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>
        <Plus className="size-4" /> New Invoice
      </Button>
    );
  }

  return (
    <Card glass className="w-full">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>New invoice</CardTitle>
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)} aria-label="Close">
          <X className="size-4" />
        </Button>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <FormField label="Type" htmlFor="invoice-type">
              <Select id="invoice-type" value={type} onChange={(e) => setType(e.target.value as typeof type)}>
                {INVOICE_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Company" htmlFor="invoice-company">
              <Select id="invoice-company" value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
                <option value="">No company</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Client" htmlFor="invoice-client">
              <Select id="invoice-client" value={clientId} onChange={(e) => setClientId(e.target.value)}>
                <option value="">No client</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Deal" htmlFor="invoice-deal">
              <Select id="invoice-deal" value={dealId} onChange={(e) => setDealId(e.target.value)}>
                <option value="">No deal</option>
                {deals.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Due date" htmlFor="invoice-due-date">
              <Input id="invoice-due-date" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </FormField>
          </div>

          <FormField label="Line items" htmlFor="invoice-items" required>
            <LineItemsEditor items={items} onChange={setItems} />
          </FormField>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <FormField label="Discount %" htmlFor="invoice-discount">
              <Input id="invoice-discount" type="number" min={0} max={100} value={discountPercent} onChange={(e) => setDiscountPercent(e.target.value)} />
            </FormField>
            <FormField label="Tax / GST %" htmlFor="invoice-tax">
              <Input id="invoice-tax" type="number" min={0} max={100} value={taxPercent} onChange={(e) => setTaxPercent(e.target.value)} />
            </FormField>
            <FormField label="Recurring" htmlFor="invoice-recurring">
              <div className="flex h-11 items-center gap-2">
                <input id="invoice-recurring" type="checkbox" checked={isRecurring} onChange={(e) => setIsRecurring(e.target.checked)} />
                {isRecurring && (
                  <Select value={recurrenceRule} onChange={(e) => setRecurrenceRule(e.target.value as (typeof RECURRENCE_RULES)[number])}>
                    {RECURRENCE_RULES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </Select>
                )}
              </div>
            </FormField>
          </div>

          <div className="flex flex-wrap justify-end gap-6 rounded-lg border border-border p-3 text-sm">
            <span>Subtotal: <strong className="text-foreground">{totals.subtotal.toFixed(2)} {currency}</strong></span>
            {totals.discountAmount > 0 && <span>Discount: <strong className="text-foreground">-{totals.discountAmount.toFixed(2)}</strong></span>}
            {totals.taxAmount > 0 && <span>Tax: <strong className="text-foreground">{totals.taxAmount.toFixed(2)}</strong></span>}
            <span>Grand Total: <strong className="text-primary">{totals.grandTotal.toFixed(2)} {currency}</strong></span>
          </div>

          <FormField label="Notes" htmlFor="invoice-notes">
            <textarea id="invoice-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full resize-none rounded-lg border border-input bg-transparent px-3.5 py-2.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          </FormField>
          <FormField label="Terms" htmlFor="invoice-terms">
            <textarea id="invoice-terms" value={terms} onChange={(e) => setTerms(e.target.value)} rows={2} className="w-full resize-none rounded-lg border border-input bg-transparent px-3.5 py-2.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          </FormField>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex gap-3">
            <Button type="submit" disabled={pending || !items.some((i) => i.description.trim())}>
              {pending ? "Creating…" : "Create invoice"}
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
