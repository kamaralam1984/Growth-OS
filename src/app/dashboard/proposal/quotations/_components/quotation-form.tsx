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
import { createQuotation } from "../../_lib/quotation-actions";

const PRICING_MODELS = ["FIXED", "HOURLY", "MONTHLY", "RETAINER", "AMC", "ENTERPRISE", "CUSTOM"] as const;

export interface QuotationFormProps {
  companies: Array<{ id: string; name: string }>;
  contacts: Array<{ id: string; name: string }>;
  deals: Array<{ id: string; name: string }>;
  currency?: string | null;
}

export function QuotationForm({ companies, contacts, deals, currency }: QuotationFormProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [contactId, setContactId] = useState("");
  const [dealId, setDealId] = useState("");
  const [pricingModel, setPricingModel] = useState("");
  const [discountPercent, setDiscountPercent] = useState("");
  const [taxPercent, setTaxPercent] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [notes, setNotes] = useState("");
  const [terms, setTerms] = useState("");
  const [items, setItems] = useState<LineItemRow[]>([{ description: "", quantity: "1", rate: "0", discountPercent: "" }]);

  const totals = useMemo(() => {
    const lineAmounts = items.map((i) => {
      const qty = Number(i.quantity) || 0;
      const rate = Number(i.rate) || 0;
      const disc = Number(i.discountPercent) || 0;
      return qty * rate * (1 - disc / 100);
    });
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
      const result = await createQuotation({
        title,
        companyId,
        contactId,
        dealId,
        pricingModel: (pricingModel || undefined) as (typeof PRICING_MODELS)[number] | undefined,
        discountPercent: discountPercent ? Number(discountPercent) : undefined,
        taxPercent: taxPercent ? Number(taxPercent) : undefined,
        validUntil: validUntil ? new Date(validUntil) : undefined,
        notes,
        terms,
        lineItems: items
          .filter((i) => i.description.trim())
          .map((i) => ({ description: i.description, quantity: Number(i.quantity) || 0, rate: Number(i.rate) || 0, discountPercent: i.discountPercent ? Number(i.discountPercent) : undefined })),
      });
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      if (result.quotationId) router.push(`/dashboard/proposal/quotations/${result.quotationId}`);
    });
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>
        <Plus className="size-4" /> New Quotation
      </Button>
    );
  }

  return (
    <Card glass className="w-full">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>New quotation</CardTitle>
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)} aria-label="Close">
          <X className="size-4" />
        </Button>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <FormField label="Title" htmlFor="quotation-title" required>
            <Input id="quotation-title" value={title} onChange={(e) => setTitle(e.target.value)} required />
          </FormField>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <FormField label="Company" htmlFor="quotation-company">
              <Select id="quotation-company" value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
                <option value="">No company</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Contact" htmlFor="quotation-contact">
              <Select id="quotation-contact" value={contactId} onChange={(e) => setContactId(e.target.value)}>
                <option value="">No contact</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Deal" htmlFor="quotation-deal">
              <Select id="quotation-deal" value={dealId} onChange={(e) => setDealId(e.target.value)}>
                <option value="">No deal</option>
                {deals.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>

          <FormField label="Line items" htmlFor="quotation-items" required>
            <LineItemsEditor items={items} onChange={setItems} showDiscount />
          </FormField>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <FormField label="Pricing model" htmlFor="quotation-pricing-model">
              <Select id="quotation-pricing-model" value={pricingModel} onChange={(e) => setPricingModel(e.target.value)}>
                <option value="">Not specified</option>
                {PRICING_MODELS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Discount %" htmlFor="quotation-discount">
              <Input id="quotation-discount" type="number" min={0} max={100} value={discountPercent} onChange={(e) => setDiscountPercent(e.target.value)} />
            </FormField>
            <FormField label="Tax / GST %" htmlFor="quotation-tax">
              <Input id="quotation-tax" type="number" min={0} max={100} value={taxPercent} onChange={(e) => setTaxPercent(e.target.value)} />
            </FormField>
            <FormField label="Valid until" htmlFor="quotation-valid-until">
              <Input id="quotation-valid-until" type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
            </FormField>
          </div>

          <div className="flex flex-wrap justify-end gap-6 rounded-lg border border-border p-3 text-sm">
            <span>Subtotal: <strong className="text-foreground">{totals.subtotal.toFixed(2)} {currency}</strong></span>
            {totals.discountAmount > 0 && <span>Discount: <strong className="text-foreground">-{totals.discountAmount.toFixed(2)}</strong></span>}
            {totals.taxAmount > 0 && <span>Tax: <strong className="text-foreground">{totals.taxAmount.toFixed(2)}</strong></span>}
            <span>Grand Total: <strong className="text-primary">{totals.grandTotal.toFixed(2)} {currency}</strong></span>
          </div>

          <FormField label="Notes" htmlFor="quotation-notes">
            <textarea id="quotation-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full resize-none rounded-lg border border-input bg-transparent px-3.5 py-2.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          </FormField>
          <FormField label="Terms" htmlFor="quotation-terms">
            <textarea id="quotation-terms" value={terms} onChange={(e) => setTerms(e.target.value)} rows={2} className="w-full resize-none rounded-lg border border-input bg-transparent px-3.5 py-2.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          </FormField>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex gap-3">
            <Button type="submit" disabled={pending || !title.trim() || !items.some((i) => i.description.trim())}>
              {pending ? "Creating…" : "Create quotation"}
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
