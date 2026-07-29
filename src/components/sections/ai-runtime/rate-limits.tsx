"use client";

import { motion } from "framer-motion";
import { Gauge } from "lucide-react";

import { Container } from "@/components/ui/container";
import { SectionHeading } from "@/components/ui/section-heading";
import { Card } from "@/components/ui/card";
import { fadeInUp, staggerContainer } from "@/animations";
import { RATE_LIMIT_REALITY } from "@/lib/ai-runtime-content";

/**
 * Deliberately restrained: RATE_LIMIT_REALITY describes a real, Redis-backed
 * rate limiter on sensitive endpoints and provider-enforced free-tier quotas
 * that trigger fallback — not an internal live "quota remaining per
 * provider" dashboard, since that doesn't exist yet. Rendered as a single
 * honest card, not a fake quota chart.
 */
function RateLimits() {
  return (
    <section className="relative py-24 sm:py-32">
      <Container className="flex flex-col items-center gap-14">
        <SectionHeading
          eyebrow="Rate limits"
          title="Real limits, honestly described"
          description="No live quota dashboard — just the real limiting that's actually enforced today."
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
                <Gauge className="size-5 shrink-0 text-primary" strokeWidth={2.5} />
                <h3 className="text-xl font-semibold text-foreground sm:text-2xl">
                  {RATE_LIMIT_REALITY.title}
                </h3>
              </div>
              <p className="text-base text-foreground/90 sm:text-lg">
                {RATE_LIMIT_REALITY.description}
              </p>
              <p className="text-sm text-muted-foreground">
                {RATE_LIMIT_REALITY.detail}
              </p>
            </Card>
          </motion.div>
        </motion.div>
      </Container>
    </section>
  );
}

export default RateLimits;
export { RateLimits };
