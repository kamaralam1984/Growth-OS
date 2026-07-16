"use client";

import { useState, useTransition } from "react";
import { motion } from "framer-motion";

import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { fadeInUp, staggerContainer } from "@/animations";
import { AI_GOALS, CLIENT_TYPES, SERVICES_OFFERED } from "@/lib/constants/onboarding";
import type { ServicesGoalsInput } from "@/lib/validations/onboarding";
import { MultiSelectChips } from "./multi-select-chips";

export interface StepServicesGoalsProps {
  initial: ServicesGoalsInput;
  onSave: (data: ServicesGoalsInput) => Promise<{ ok: boolean; error?: string }>;
}

export function StepServicesGoals({ initial, onSave }: StepServicesGoalsProps) {
  const [form, setForm] = useState<ServicesGoalsInput>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function set<K extends keyof ServicesGoalsInput>(key: K, value: ServicesGoalsInput[K]) {
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
      className="flex flex-col gap-7"
    >
      <motion.div variants={fadeInUp}>
        <FormField
          label="Services offered"
          htmlFor="services"
          hint="What your team delivers today — this shapes how your AI agents pitch and qualify leads."
        >
          <MultiSelectChips
            options={SERVICES_OFFERED}
            selected={form.services}
            onChange={(next) => set("services", next)}
          />
        </FormField>
      </motion.div>

      <motion.div variants={fadeInUp}>
        <FormField
          label="Client types you serve"
          htmlFor="clientTypes"
          hint="Helps your agents recognize a good-fit lead when they see one."
        >
          <MultiSelectChips
            options={CLIENT_TYPES}
            selected={form.clientTypes}
            onChange={(next) => set("clientTypes", next)}
          />
        </FormField>
      </motion.div>

      <motion.div variants={fadeInUp}>
        <FormField
          label="What should your AI workforce focus on?"
          htmlFor="aiGoals"
          hint="Pick everything you'd like agents to help with — you can add more agents later."
        >
          <MultiSelectChips
            options={AI_GOALS}
            selected={form.aiGoals}
            onChange={(next) => set("aiGoals", next)}
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
          {pending ? "Saving..." : "Finish setup"}
        </Button>
      </motion.div>
    </motion.form>
  );
}
