"use client";

import { motion } from "framer-motion";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";
import { EASES } from "@/animations";

export interface WizardStepMeta {
  step: number;
  label: string;
}

export const WIZARD_STEPS: WizardStepMeta[] = [
  { step: 1, label: "Company Profile" },
  { step: 2, label: "Business Details" },
  { step: 3, label: "Services & Goals" },
];

export interface OnboardingProgressBarProps {
  currentStep: number;
  /** Highest step number the user has already saved (0 = none yet). */
  maxUnlockedStep: number;
  onStepSelect: (step: number) => void;
}

export function OnboardingProgressBar({
  currentStep,
  maxUnlockedStep,
  onStepSelect,
}: OnboardingProgressBarProps) {
  const total = WIZARD_STEPS.length;
  const progressPercent = (maxUnlockedStep / total) * 100;

  return (
    <div className="flex flex-col gap-4">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <motion.div
          className="h-full rounded-full bg-primary"
          initial={false}
          animate={{ width: `${progressPercent}%` }}
          transition={{ duration: 0.5, ease: EASES.outExpo }}
        />
      </div>

      <ol className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        {WIZARD_STEPS.map(({ step, label }) => {
          const isComplete = step <= maxUnlockedStep;
          const isActive = step === currentStep;
          const isUnlocked = step <= maxUnlockedStep + 1;

          return (
            <li key={step} className="flex-1">
              <button
                type="button"
                disabled={!isUnlocked}
                onClick={() => isUnlocked && onStepSelect(step)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left transition-colors duration-150 ease-[var(--ease-out-quad)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40",
                  isActive
                    ? "border-primary bg-primary/10"
                    : "border-border bg-transparent hover:bg-accent",
                )}
              >
                <span
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors",
                    isComplete
                      ? "bg-primary text-primary-foreground"
                      : isActive
                        ? "border border-primary text-primary"
                        : "border border-border text-muted-foreground",
                  )}
                >
                  {isComplete ? <Check className="size-3.5" /> : step}
                </span>
                <span
                  className={cn(
                    "text-sm font-medium",
                    isActive || isComplete ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {label}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
