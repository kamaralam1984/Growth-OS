"use client";

import { motion } from "framer-motion";
import { RefreshCw } from "lucide-react";

import { Container } from "@/components/ui/container";
import { SectionHeading } from "@/components/ui/section-heading";
import { Card } from "@/components/ui/card";
import { fadeInUp, staggerContainer } from "@/animations";
import { FAILOVER_MECHANISM } from "@/lib/ai-runtime-content";

/**
 * Deliberately restrained: FAILOVER_MECHANISM describes a synchronous
 * try-next-provider fallback with a 60-second cooldown, not an async
 * health-monitoring pipeline. Rendered as a single honest card — no
 * "Health Check → Detection → Fallback → Recovery" state diagram, since
 * that mechanism doesn't exist in this codebase.
 */
function AutoFailover() {
  return (
    <section className="relative py-24 sm:py-32">
      <Container className="flex flex-col items-center gap-14">
        <SectionHeading
          eyebrow="Automatic failover"
          title="Real fallback, honestly described"
          description="No idealized health-monitoring pipeline — just a working mechanism, described as it actually runs."
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
                <RefreshCw className="size-5 shrink-0 text-primary" strokeWidth={2.5} />
                <h3 className="text-xl font-semibold text-foreground sm:text-2xl">
                  {FAILOVER_MECHANISM.title}
                </h3>
              </div>
              <p className="text-base text-foreground/90 sm:text-lg">
                {FAILOVER_MECHANISM.description}
              </p>
              <p className="text-sm text-muted-foreground">
                {FAILOVER_MECHANISM.detail}
              </p>
            </Card>
          </motion.div>
        </motion.div>
      </Container>
    </section>
  );
}

export default AutoFailover;
export { AutoFailover };
