"use client";

import { motion } from "framer-motion";
import { Sparkles, Zap, Target, Send } from "lucide-react";

import { fadeInUp, staggerContainer } from "@/animations";
import { Badge } from "@/components/ui/badge";
import { Spotlight } from "@/components/ui/spotlight";
import { cn } from "@/lib/utils";
import type { EffectiveBranding } from "@/lib/white-label/resolve-brand";

const FEATURES = [
  { icon: Zap, label: "5 AI agents working around the clock" },
  { icon: Target, label: "Real-time pipeline prioritization" },
  { icon: Send, label: "Automated proposals & outreach" },
] as const;

/**
 * Decorative lg+ showcase panel — real GrowthOS product marketing (mirrors
 * the homepage hero's copy/visual language) only when this request is
 * UNBRANDED. A white-labeled client's own login page must never carry
 * GrowthOS's own marketing copy, so that case renders a neutral panel with
 * just their resolved brand name/logo instead — same "never leak platform
 * branding into a white-labeled experience" rule the rest of white-label
 * follows (see resolveBrandByHost / dashboard chrome).
 */
export function LoginShowcasePanel({ branding }: { branding: EffectiveBranding }) {
  return (
    <div className="relative hidden overflow-hidden border-r border-border lg:flex lg:w-1/2">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-20 bg-aurora" />
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-grid opacity-40" />

      <Spotlight className={cn("flex flex-1 items-center bg-noise")} size={560}>
        <div className="relative flex max-w-md flex-col gap-8 p-16">
          {branding.isWhiteLabeled ? (
            <motion.div initial="hidden" animate="visible" variants={staggerContainer} className="flex flex-col gap-4">
              <motion.div variants={fadeInUp}>
                {branding.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- org-uploaded asset, not a static/optimizable local image
                  <img src={branding.logoUrl} alt={branding.brandName} className="h-10 w-auto" />
                ) : (
                  <span className="text-2xl font-semibold tracking-tight text-foreground">{branding.brandName}</span>
                )}
              </motion.div>
              <motion.h2 variants={fadeInUp} className="text-balance text-3xl font-semibold tracking-tight text-foreground">
                {branding.customLoginHeadline ?? `Welcome back to ${branding.brandName}`}
              </motion.h2>
            </motion.div>
          ) : (
            <motion.div initial="hidden" animate="visible" variants={staggerContainer} className="flex flex-col gap-6">
              <motion.div variants={fadeInUp}>
                <Badge variant="accent">
                  <Sparkles />
                  AI Workforce for Business Growth
                </Badge>
              </motion.div>

              <motion.h1 variants={fadeInUp} className="text-balance text-4xl font-semibold tracking-tight text-foreground">
                The AI workforce that grows your <span className="text-gradient-brand">business 24/7</span>
              </motion.h1>

              <motion.p variants={fadeInUp} className="text-balance text-base text-muted-foreground">
                Five AI agents prioritize your pipeline, qualify inbound leads, draft proposals, and send outreach —
                so deals move forward whether or not anyone&apos;s logged in.
              </motion.p>

              <motion.ul variants={fadeInUp} className="mt-4 flex flex-col gap-4">
                {FEATURES.map(({ icon: Icon, label }) => (
                  <li key={label} className="flex items-center gap-3 text-sm text-foreground">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-primary">
                      <Icon className="size-4" />
                    </span>
                    {label}
                  </li>
                ))}
              </motion.ul>
            </motion.div>
          )}
        </div>
      </Spotlight>
    </div>
  );
}
