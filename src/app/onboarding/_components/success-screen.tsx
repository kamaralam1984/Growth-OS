"use client";

import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EASES } from "@/animations";

export interface SuccessScreenProps {
  organizationName: string;
  organizationId: string;
}

export function SuccessScreen({ organizationName, organizationId }: SuccessScreenProps) {
  const router = useRouter();

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: EASES.outExpo }}
      className="flex flex-col items-center gap-6 py-6 text-center"
    >
      <motion.div
        initial={{ scale: 0, rotate: -30 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ duration: 0.7, ease: EASES.spring, delay: 0.1 }}
        className="flex size-20 items-center justify-center rounded-full bg-primary shadow-glow-primary"
      >
        <Check className="size-10 text-primary-foreground" strokeWidth={2.5} />
      </motion.div>

      <div className="flex flex-col gap-2">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          {organizationName} is ready.
        </h2>
        <p className="max-w-md text-balance text-muted-foreground">
          Your company profile, business details, and goals are saved. Next, meet the AI
          agents that will start working your pipeline.
        </p>
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.35, duration: 0.4 }}
      >
        <Button
          size="lg"
          onClick={() => router.push(`/onboarding/agents?organizationId=${encodeURIComponent(organizationId)}`)}
        >
          Meet your AI workforce
        </Button>
      </motion.div>
    </motion.div>
  );
}
