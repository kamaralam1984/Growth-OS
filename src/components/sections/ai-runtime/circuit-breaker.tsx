"use client";

import { motion } from "framer-motion";
import { Timer } from "lucide-react";

import { Container } from "@/components/ui/container";
import { SectionHeading } from "@/components/ui/section-heading";
import { Card } from "@/components/ui/card";
import { fadeInUp, staggerContainer } from "@/animations";
import { CIRCUIT_BREAKER_REALITY } from "@/lib/ai-runtime-content";

/**
 * Deliberately restrained: CIRCUIT_BREAKER_REALITY describes a per-provider
 * cooldown timer, not a formal closed/open/half-open state machine. Rendered
 * as a single honest card — no 3-state circuit breaker diagram, since that
 * mechanism doesn't exist in this codebase and the content itself says so.
 */
function CircuitBreaker() {
  return (
    <section className="relative py-24 sm:py-32">
      <Container className="flex flex-col items-center gap-14">
        <SectionHeading
          eyebrow="Failure cooldown"
          title="A real cooldown, not a textbook circuit breaker"
          description="We describe what's actually built, not the idealized version of it."
        />

        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          className="w-full max-w-3xl"
        >
          <motion.div variants={fadeInUp}>
            <Card glass className="flex flex-col gap-4 p-8 sm:p-10">
              <div className="flex items-start gap-3">
                <Timer className="size-5 shrink-0 text-primary" strokeWidth={2.5} />
                <h3 className="text-xl font-semibold text-foreground sm:text-2xl">
                  {CIRCUIT_BREAKER_REALITY.title}
                </h3>
              </div>
              <p className="text-base text-foreground/90 sm:text-lg">
                {CIRCUIT_BREAKER_REALITY.description}
              </p>
              <p className="text-sm text-muted-foreground">
                {CIRCUIT_BREAKER_REALITY.detail}
              </p>
            </Card>
          </motion.div>
        </motion.div>
      </Container>
    </section>
  );
}

export default CircuitBreaker;
export { CircuitBreaker };
