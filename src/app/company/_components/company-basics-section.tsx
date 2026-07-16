"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TagInput } from "@/app/onboarding/_components/tag-input";
import type { CompanyAboutInput } from "@/lib/validations/company";
import { updateCompanyAbout } from "../actions";

export interface CompanyBasicsSectionProps {
  orgId: string;
  canEdit: boolean;
  initial: CompanyAboutInput;
}

export function CompanyBasicsSection({ orgId, canEdit, initial }: CompanyBasicsSectionProps) {
  const [form, setForm] = useState<CompanyAboutInput>(initial);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, startTransition] = useTransition();

  function set<K extends keyof CompanyAboutInput>(key: K, value: CompanyAboutInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSuccess(false);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    startTransition(async () => {
      const result = await updateCompanyAbout(orgId, form);
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
          <CardTitle>About</CardTitle>
          <CardDescription>Logo, banner, mission, vision, and values.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 text-sm">
          <p className="text-muted-foreground">{form.description || "No description yet."}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Mission</p>
              <p className="text-foreground">{form.mission || "—"}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Vision</p>
              <p className="text-foreground">{form.vision || "—"}</p>
            </div>
          </div>
          {form.values.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {form.values.map((value) => (
                <Badge key={value} variant="outline">
                  {value}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card glass>
      <CardHeader>
        <CardTitle>About</CardTitle>
        <CardDescription>
          Logo, banner, mission, vision, and values — your AI agents use this to represent you accurately.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Logo URL" htmlFor="logo">
              <Input id="logo" type="url" value={form.logo ?? ""} onChange={(e) => set("logo", e.target.value)} />
            </FormField>
            <FormField label="Banner URL" htmlFor="banner">
              <Input id="banner" type="url" value={form.banner ?? ""} onChange={(e) => set("banner", e.target.value)} />
            </FormField>
          </div>

          <FormField label="About" htmlFor="description">
            <textarea
              id="description"
              rows={4}
              value={form.description ?? ""}
              onChange={(e) => set("description", e.target.value)}
              className="w-full rounded-lg border border-input bg-transparent px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </FormField>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Mission" htmlFor="mission">
              <textarea
                id="mission"
                rows={3}
                value={form.mission ?? ""}
                onChange={(e) => set("mission", e.target.value)}
                className="w-full rounded-lg border border-input bg-transparent px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </FormField>
            <FormField label="Vision" htmlFor="vision">
              <textarea
                id="vision"
                rows={3}
                value={form.vision ?? ""}
                onChange={(e) => set("vision", e.target.value)}
                className="w-full rounded-lg border border-input bg-transparent px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </FormField>
          </div>

          <FormField label="Values" htmlFor="values" hint="Add as many as you like and press Enter.">
            <TagInput
              presetOptions={[]}
              value={form.values}
              onChange={(next) => set("values", next)}
              placeholder="e.g. Transparency — press Enter"
            />
          </FormField>

          <div className="grid gap-4 sm:grid-cols-3">
            <FormField label="LinkedIn" htmlFor="linkedin">
              <Input id="linkedin" type="url" value={form.linkedin ?? ""} onChange={(e) => set("linkedin", e.target.value)} />
            </FormField>
            <FormField label="Facebook" htmlFor="facebook">
              <Input id="facebook" type="url" value={form.facebook ?? ""} onChange={(e) => set("facebook", e.target.value)} />
            </FormField>
            <FormField label="Twitter / X" htmlFor="twitter">
              <Input id="twitter" type="url" value={form.twitter ?? ""} onChange={(e) => set("twitter", e.target.value)} />
            </FormField>
          </div>

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
