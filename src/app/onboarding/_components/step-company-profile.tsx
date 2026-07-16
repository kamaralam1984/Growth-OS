"use client";

import { useState, useTransition } from "react";
import { motion } from "framer-motion";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form-field";
import { fadeInUp, staggerContainer } from "@/animations";
import type { CompanyProfileInput } from "@/lib/validations/onboarding";

const INDUSTRIES = [
  "Software & IT Services",
  "Healthcare",
  "Finance & Banking",
  "Real Estate",
  "Manufacturing",
  "Retail & E-commerce",
  "Education",
  "Logistics & Supply Chain",
  "Consulting",
  "Marketing & Advertising",
  "Hospitality & Travel",
  "Other",
];

export interface StepCompanyProfileProps {
  initial: CompanyProfileInput;
  onSave: (data: CompanyProfileInput) => Promise<{ ok: boolean; error?: string }>;
}

export function StepCompanyProfile({ initial, onSave }: StepCompanyProfileProps) {
  const [form, setForm] = useState<CompanyProfileInput>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function set<K extends keyof CompanyProfileInput>(key: K, value: CompanyProfileInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await onSave(form);
      if (!result.ok) setError(result.error ?? "Something went wrong. Please try again.");
    });
  }

  return (
    <motion.form
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      onSubmit={handleSubmit}
      className="flex flex-col gap-5"
    >
      <motion.div variants={fadeInUp}>
        <FormField label="Company name" htmlFor="name" required>
          <Input
            id="name"
            type="text"
            placeholder="Acme Software Ltd."
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            required
          />
        </FormField>
      </motion.div>

      <motion.div variants={fadeInUp} className="grid gap-4 sm:grid-cols-2">
        <FormField label="Industry" htmlFor="industry">
          <Select id="industry" value={form.industry ?? ""} onChange={(e) => set("industry", e.target.value)}>
            <option value="">Select an industry</option>
            {INDUSTRIES.map((industry) => (
              <option key={industry} value={industry}>
                {industry}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Logo URL" htmlFor="logo">
          <Input
            id="logo"
            type="url"
            placeholder="https://..."
            value={form.logo ?? ""}
            onChange={(e) => set("logo", e.target.value)}
          />
        </FormField>
      </motion.div>

      <motion.div variants={fadeInUp} className="grid gap-4 sm:grid-cols-2">
        <FormField label="Website" htmlFor="website">
          <Input
            id="website"
            type="url"
            placeholder="https://yourcompany.com"
            value={form.website ?? ""}
            onChange={(e) => set("website", e.target.value)}
          />
        </FormField>
        <FormField label="Company email" htmlFor="email">
          <Input
            id="email"
            type="email"
            placeholder="hello@yourcompany.com"
            value={form.email ?? ""}
            onChange={(e) => set("email", e.target.value)}
          />
        </FormField>
      </motion.div>

      <motion.div variants={fadeInUp} className="grid gap-4 sm:grid-cols-2">
        <FormField label="Phone" htmlFor="phone">
          <Input
            id="phone"
            type="tel"
            placeholder="+1 555 010 2020"
            value={form.phone ?? ""}
            onChange={(e) => set("phone", e.target.value)}
          />
        </FormField>
        <FormField label="GST number" htmlFor="gstNumber">
          <Input
            id="gstNumber"
            type="text"
            placeholder="e.g. 22AAAAA0000A1Z5"
            value={form.gstNumber ?? ""}
            onChange={(e) => set("gstNumber", e.target.value)}
          />
        </FormField>
      </motion.div>

      <motion.div variants={fadeInUp}>
        <FormField label="Registration number" htmlFor="registrationNumber">
          <Input
            id="registrationNumber"
            type="text"
            placeholder="Company / incorporation registration number"
            value={form.registrationNumber ?? ""}
            onChange={(e) => set("registrationNumber", e.target.value)}
          />
        </FormField>
      </motion.div>

      <motion.div variants={fadeInUp} className="grid gap-4 sm:grid-cols-3">
        <FormField label="LinkedIn" htmlFor="linkedin">
          <Input
            id="linkedin"
            type="url"
            placeholder="https://linkedin.com/company/..."
            value={form.linkedin ?? ""}
            onChange={(e) => set("linkedin", e.target.value)}
          />
        </FormField>
        <FormField label="Facebook" htmlFor="facebook">
          <Input
            id="facebook"
            type="url"
            placeholder="https://facebook.com/..."
            value={form.facebook ?? ""}
            onChange={(e) => set("facebook", e.target.value)}
          />
        </FormField>
        <FormField label="Twitter / X" htmlFor="twitter">
          <Input
            id="twitter"
            type="url"
            placeholder="https://x.com/..."
            value={form.twitter ?? ""}
            onChange={(e) => set("twitter", e.target.value)}
          />
        </FormField>
      </motion.div>

      <motion.div variants={fadeInUp}>
        <FormField label="Description" htmlFor="description" hint="A couple of sentences on what your company does — your AI agents use this to represent you accurately.">
          <textarea
            id="description"
            rows={4}
            placeholder="We help mid-market retailers modernize their e-commerce stack..."
            value={form.description ?? ""}
            onChange={(e) => set("description", e.target.value)}
            className="w-full rounded-lg border border-input bg-transparent px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </FormField>
      </motion.div>

      {error && (
        <motion.p variants={fadeInUp} className="text-sm text-destructive">
          {error}
        </motion.p>
      )}

      <motion.div variants={fadeInUp} className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving..." : "Save & continue"}
        </Button>
      </motion.div>
    </motion.form>
  );
}
