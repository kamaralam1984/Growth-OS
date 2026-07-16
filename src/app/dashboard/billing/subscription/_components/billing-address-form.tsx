"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MapPin } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form-field";
import { toast } from "@/components/ui/toast";
import { updateBillingAddressAction } from "../actions";

// ISO alpha-2 codes (not the free-text country names used by the
// registration/onboarding forms' COMMON_COUNTRIES) — this list feeds
// directly into resolveTaxRule (src/lib/billing/tax-rates.ts), which keys
// its real, documented tax-rate table by ISO code. Deliberately curated,
// same spirit as COMMON_COUNTRIES: covers every country tax-rates.ts has a
// real rule for, plus a handful of other common ones (which resolve to
// NONE/0% honestly, rather than a guessed rate).
const BILLING_COUNTRIES: { code: string; label: string }[] = [
  { code: "US", label: "United States" },
  { code: "GB", label: "United Kingdom" },
  { code: "CA", label: "Canada" },
  { code: "AU", label: "Australia" },
  { code: "IN", label: "India" },
  { code: "PK", label: "Pakistan" },
  { code: "AE", label: "United Arab Emirates" },
  { code: "SA", label: "Saudi Arabia" },
  { code: "DE", label: "Germany" },
  { code: "FR", label: "France" },
  { code: "NL", label: "Netherlands" },
  { code: "SE", label: "Sweden" },
  { code: "IE", label: "Ireland" },
  { code: "ES", label: "Spain" },
  { code: "IT", label: "Italy" },
  { code: "CH", label: "Switzerland" },
  { code: "SG", label: "Singapore" },
  { code: "JP", label: "Japan" },
  { code: "CN", label: "China" },
  { code: "KR", label: "South Korea" },
  { code: "ID", label: "Indonesia" },
  { code: "PH", label: "Philippines" },
  { code: "BD", label: "Bangladesh" },
  { code: "NG", label: "Nigeria" },
  { code: "ZA", label: "South Africa" },
  { code: "BR", label: "Brazil" },
  { code: "MX", label: "Mexico" },
  { code: "NZ", label: "New Zealand" },
  { code: "IL", label: "Israel" },
];

export interface BillingAddressFormProps {
  canManage: boolean;
  initial: {
    legalName: string;
    line1: string;
    line2: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
    taxId: string;
  };
  resolvedTax: { ruleType: string; ratePercent: number } | null;
}

export function BillingAddressForm({ canManage, initial, resolvedTax }: BillingAddressFormProps) {
  const [values, setValues] = useState(initial);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function set<K extends keyof typeof values>(key: K, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await updateBillingAddressAction(values);
      if (!result.ok) {
        toast.error(result.error ?? "Could not save the billing address.");
        return;
      }
      toast.success("Billing address saved.");
      router.refresh();
    });
  }

  return (
    <Card glass>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MapPin className="size-4" /> Billing address & tax
        </CardTitle>
        <CardDescription>
          Used on your platform invoices.
          {resolvedTax && (
            <>
              {" "}
              Current resolved tax: <strong className="text-foreground">{resolvedTax.ruleType}</strong> at{" "}
              <strong className="text-foreground">{resolvedTax.ratePercent}%</strong>.
            </>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Legal name" htmlFor="billing-legal-name" className="sm:col-span-2">
            <Input id="billing-legal-name" value={values.legalName} onChange={(e) => set("legalName", e.target.value)} disabled={!canManage} />
          </FormField>
          <FormField label="Address line 1" htmlFor="billing-line1" className="sm:col-span-2">
            <Input id="billing-line1" value={values.line1} onChange={(e) => set("line1", e.target.value)} disabled={!canManage} />
          </FormField>
          <FormField label="Address line 2" htmlFor="billing-line2" className="sm:col-span-2">
            <Input id="billing-line2" value={values.line2} onChange={(e) => set("line2", e.target.value)} disabled={!canManage} />
          </FormField>
          <FormField label="City" htmlFor="billing-city">
            <Input id="billing-city" value={values.city} onChange={(e) => set("city", e.target.value)} disabled={!canManage} />
          </FormField>
          <FormField label="State / region" htmlFor="billing-state">
            <Input id="billing-state" value={values.state} onChange={(e) => set("state", e.target.value)} disabled={!canManage} />
          </FormField>
          <FormField label="Postal code" htmlFor="billing-postal">
            <Input id="billing-postal" value={values.postalCode} onChange={(e) => set("postalCode", e.target.value)} disabled={!canManage} />
          </FormField>
          <FormField label="Country" htmlFor="billing-country">
            <Select id="billing-country" value={values.country} onChange={(e) => set("country", e.target.value)} disabled={!canManage}>
              <option value="">Select a country</option>
              {BILLING_COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Tax ID (GST/VAT/etc.)" htmlFor="billing-tax-id" className="sm:col-span-2">
            <Input id="billing-tax-id" value={values.taxId} onChange={(e) => set("taxId", e.target.value)} disabled={!canManage} />
          </FormField>

          {canManage && (
            <div className="sm:col-span-2">
              <Button type="submit" disabled={pending}>
                {pending ? "Saving..." : "Save billing address"}
              </Button>
            </div>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
