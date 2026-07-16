"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MultiSelectChips } from "@/app/onboarding/_components/multi-select-chips";
import { SERVICES_OFFERED, CLIENT_TYPES } from "@/lib/constants/onboarding";
import type { CompanyServicesInput } from "@/lib/validations/company";
import { updateCompanyServices } from "../actions";

export interface CompanyServicesSectionProps {
  orgId: string;
  canEdit: boolean;
  initial: CompanyServicesInput;
}

export function CompanyServicesSection({ orgId, canEdit, initial }: CompanyServicesSectionProps) {
  const [form, setForm] = useState<CompanyServicesInput>(initial);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    startTransition(async () => {
      const result = await updateCompanyServices(orgId, form);
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
          <CardTitle>Services & industries</CardTitle>
          <CardDescription>What you offer and who you serve.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            {form.services.length > 0 ? (
              form.services.map((s) => (
                <Badge key={s} variant="outline">
                  {s}
                </Badge>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No services listed yet.</p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {form.clientTypes.length > 0 ? (
              form.clientTypes.map((c) => (
                <Badge key={c} variant="accent">
                  {c}
                </Badge>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No industries listed yet.</p>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card glass>
      <CardHeader>
        <CardTitle>Services & industries</CardTitle>
        <CardDescription>What you offer, and the industries you serve.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          <FormField label="Services offered" htmlFor="services">
            <MultiSelectChips
              options={SERVICES_OFFERED}
              selected={form.services}
              onChange={(next) => {
                setForm((prev) => ({ ...prev, services: next }));
                setSuccess(false);
              }}
            />
          </FormField>

          <FormField label="Industries served" htmlFor="clientTypes">
            <MultiSelectChips
              options={CLIENT_TYPES}
              selected={form.clientTypes}
              onChange={(next) => {
                setForm((prev) => ({ ...prev, clientTypes: next }));
                setSuccess(false);
              }}
            />
          </FormField>

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
