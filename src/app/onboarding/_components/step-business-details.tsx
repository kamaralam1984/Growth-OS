"use client";

import { useState, useTransition } from "react";
import { motion } from "framer-motion";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form-field";
import { cn } from "@/lib/utils";
import { fadeInUp, staggerContainer } from "@/animations";
import { COMMON_COUNTRIES, COMMON_CURRENCIES, COMMON_LANGUAGES, COMPANY_SIZE_OPTIONS } from "@/lib/constants/onboarding";
import type { BusinessDetailsInput } from "@/lib/validations/onboarding";
import { TagInput } from "./tag-input";

export interface StepBusinessDetailsProps {
  initial: BusinessDetailsInput;
  onSave: (data: BusinessDetailsInput) => Promise<{ ok: boolean; error?: string }>;
}

export function StepBusinessDetails({ initial, onSave }: StepBusinessDetailsProps) {
  const [form, setForm] = useState<BusinessDetailsInput>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function set<K extends keyof BusinessDetailsInput>(key: K, value: BusinessDetailsInput[K]) {
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
      className="flex flex-col gap-6"
    >
      <motion.div variants={fadeInUp}>
        <FormField label="Company size" htmlFor="companySize-1">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {COMPANY_SIZE_OPTIONS.map(({ value, label }, index) => {
              const active = form.companySize === value;
              return (
                <label
                  key={value}
                  htmlFor={`companySize-${index}`}
                  className={cn(
                    "flex cursor-pointer flex-col items-center gap-1 rounded-xl border px-2 py-3 text-center text-xs font-medium transition-colors duration-150",
                    active
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border bg-transparent text-muted-foreground hover:bg-accent",
                  )}
                >
                  <input
                    id={`companySize-${index}`}
                    type="radio"
                    name="companySize"
                    value={value}
                    checked={active}
                    onChange={() => set("companySize", value)}
                    className="sr-only"
                  />
                  {label}
                </label>
              );
            })}
          </div>
        </FormField>
      </motion.div>

      <motion.div variants={fadeInUp} className="grid gap-4 sm:grid-cols-2">
        <FormField
          label="Annual revenue"
          htmlFor="annualRevenue"
          hint="Whatever range you're comfortable sharing, e.g. $1M–$5M."
        >
          <Input
            id="annualRevenue"
            type="text"
            placeholder="e.g. $1M–$5M"
            value={form.annualRevenue ?? ""}
            onChange={(e) => set("annualRevenue", e.target.value)}
          />
        </FormField>
        <FormField label="Primary market" htmlFor="primaryMarket" hint="The region you sell to the most.">
          <Input
            id="primaryMarket"
            type="text"
            placeholder="e.g. North America, APAC, Global"
            value={form.primaryMarket ?? ""}
            onChange={(e) => set("primaryMarket", e.target.value)}
          />
        </FormField>
      </motion.div>

      <motion.div variants={fadeInUp}>
        <FormField
          label="Countries served"
          htmlFor="countriesServed"
          hint="Toggle common countries or add your own — press Enter to add."
        >
          <TagInput
            presetOptions={COMMON_COUNTRIES}
            value={form.countriesServed}
            onChange={(next) => set("countriesServed", next)}
          />
        </FormField>
      </motion.div>

      <motion.div variants={fadeInUp} className="grid gap-4 sm:grid-cols-2">
        <FormField label="Primary language" htmlFor="primaryLanguage">
          <Select
            id="primaryLanguage"
            value={form.primaryLanguage ?? ""}
            onChange={(e) => set("primaryLanguage", e.target.value)}
          >
            <option value="">Select a language</option>
            {COMMON_LANGUAGES.map((language) => (
              <option key={language} value={language}>
                {language}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Currency" htmlFor="currency">
          <Select id="currency" value={form.currency ?? ""} onChange={(e) => set("currency", e.target.value)}>
            <option value="">Select a currency</option>
            {COMMON_CURRENCIES.map((currency) => (
              <option key={currency} value={currency}>
                {currency}
              </option>
            ))}
          </Select>
        </FormField>
      </motion.div>

      <motion.div variants={fadeInUp}>
        <FormField
          label="Timezone"
          htmlFor="timezone-business"
          hint="IANA name, e.g. America/New_York or Asia/Karachi."
        >
          <Input
            id="timezone-business"
            type="text"
            placeholder="e.g. Asia/Karachi"
            value={form.timezone ?? ""}
            onChange={(e) => set("timezone", e.target.value)}
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
