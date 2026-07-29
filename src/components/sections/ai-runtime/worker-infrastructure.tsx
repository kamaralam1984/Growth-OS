"use client";

import { motion } from "framer-motion";
import { Cpu } from "lucide-react";

import { Container } from "@/components/ui/container";
import { SectionHeading } from "@/components/ui/section-heading";
import { Card } from "@/components/ui/card";
import { fadeInUp, staggerContainer } from "@/animations";
import { WORKER_INFRASTRUCTURE } from "@/lib/ai-runtime-content";

/**
 * Deliberately restrained: WORKER_INFRASTRUCTURE describes 7 real BullMQ
 * workers running in-process today. The detail is honest that Kubernetes
 * HPA and PM2 cluster-mode configs exist in this codebase for a future
 * multi-instance deployment but are NOT what's actively running in
 * production yet — that distinction is intentionally not softened or
 * omitted. Rendered as a single honest card, not a fake scaling dashboard.
 */
function WorkerInfrastructure() {
  return (
    <section className="relative py-24 sm:py-32">
      <Container className="flex flex-col items-center gap-14">
        <SectionHeading
          eyebrow="Worker infrastructure"
          title="Real workers, honestly scoped"
          description="Seven background workers run today — described as they actually run, not as they might scale."
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
                <Cpu className="size-5 shrink-0 text-primary" strokeWidth={2.5} />
                <h3 className="text-xl font-semibold text-foreground sm:text-2xl">
                  {WORKER_INFRASTRUCTURE.title}
                </h3>
              </div>
              <p className="text-base text-foreground/90 sm:text-lg">
                {WORKER_INFRASTRUCTURE.description}
              </p>
              <p className="text-sm text-muted-foreground">
                {WORKER_INFRASTRUCTURE.detail}
              </p>
            </Card>
          </motion.div>
        </motion.div>
      </Container>
    </section>
  );
}

export default WorkerInfrastructure;
export { WorkerInfrastructure };
