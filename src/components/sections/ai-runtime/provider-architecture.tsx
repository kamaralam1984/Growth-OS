"use client";

import { motion } from "framer-motion";
import { ChevronDown } from "lucide-react";

import { Container } from "@/components/ui/container";
import { SectionHeading } from "@/components/ui/section-heading";
import { Card } from "@/components/ui/card";
import { fadeInUp, staggerContainer } from "@/animations";
import { RUNTIME_PROVIDERS } from "@/lib/ai-runtime-content";

/**
 * The real, priority-ordered AI provider fallback chain — sourced 1:1 from
 * RUNTIME_PROVIDERS in src/lib/ai-runtime-content.ts, which is itself
 * sourced from src/lib/ai/fallback.ts. Only four providers exist; no
 * "Local Models" or "Custom API" provider is real, so none is shown here.
 */
function ProviderArchitecture() {
  if (RUNTIME_PROVIDERS.length === 0) {
    return null;
  }

  return (
    <section id="architecture" className="relative py-24 sm:py-32">
      <Container className="flex flex-col items-center gap-14">
        <SectionHeading
          eyebrow="Architecture"
          title="A real, priority-ordered provider chain"
          description="Four real providers, tried in this exact order on every request — not a wishlist of integrations we plan to add someday."
        />

        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          className="flex w-full max-w-md flex-col items-center"
        >
          {RUNTIME_PROVIDERS.map((provider, index) => {
            const isLast = index === RUNTIME_PROVIDERS.length - 1;
            return (
              <div key={provider.name} className="flex w-full flex-col items-center">
                <motion.div variants={fadeInUp} className="flex w-full justify-center">
                  <Card glass className="flex w-full max-w-md flex-col gap-1 p-5">
                    <span className="text-sm font-semibold text-foreground">{provider.name}</span>
                    <p className="text-sm text-muted-foreground">{provider.role}</p>
                  </Card>
                </motion.div>
                {!isLast && (
                  <span aria-hidden className="flex justify-center py-1">
                    <ChevronDown className="size-5 text-muted-foreground" />
                  </span>
                )}
              </div>
            );
          })}
        </motion.div>

        <motion.p
          variants={fadeInUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-40px" }}
          className="max-w-2xl text-balance text-center text-sm text-muted-foreground"
        >
          This is the real fallback order used on every request: if the
          primary provider fails, the next provider in the list is tried
          automatically, within the same request. These four are the only
          AI providers this runtime has — nothing else is wired in.
        </motion.p>
      </Container>
    </section>
  );
}

export default ProviderArchitecture;
export { ProviderArchitecture };
