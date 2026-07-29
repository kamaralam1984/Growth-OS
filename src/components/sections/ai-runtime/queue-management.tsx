"use client";

import { motion } from "framer-motion";
import { ListOrdered } from "lucide-react";

import { Container } from "@/components/ui/container";
import { SectionHeading } from "@/components/ui/section-heading";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fadeInUp, staggerContainer } from "@/animations";
import { RUNTIME_QUEUES, QUEUE_REALITY_NOTE } from "@/lib/ai-runtime-content";

/**
 * One card per real BullMQ queue (RUNTIME_QUEUES). QUEUE_REALITY_NOTE is
 * rendered below the grid as an honest disclaimer — it discloses that only
 * 1 of 7 queues has a dedicated retry UI, which is real and must not be
 * omitted.
 */
function QueueManagement() {
  if (RUNTIME_QUEUES.length === 0) {
    return null;
  }

  return (
    <section className="relative py-24 sm:py-32">
      <Container className="flex flex-col items-center gap-14">
        <SectionHeading
          eyebrow="Queue management"
          title="7 real background queues"
          description="Every queue below is a working BullMQ worker in this codebase — not a mock."
        />

        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {RUNTIME_QUEUES.map((queue) => (
            <motion.div key={queue.name} variants={fadeInUp}>
              <Card glass className="flex h-full flex-col gap-3 p-5">
                <span className="flex items-start gap-2.5">
                  <ListOrdered className="size-4 shrink-0 text-primary" strokeWidth={2.5} />
                  <span className="flex flex-col gap-1">
                    <span className="text-sm font-semibold text-foreground">{queue.name}</span>
                    <span className="text-sm text-muted-foreground">{queue.purpose}</span>
                  </span>
                </span>
                <div>
                  <Badge variant="accent">{queue.retryPolicy}</Badge>
                </div>
              </Card>
            </motion.div>
          ))}
        </motion.div>

        <p className="max-w-2xl text-balance text-center text-sm text-muted-foreground">
          {QUEUE_REALITY_NOTE}
        </p>
      </Container>
    </section>
  );
}

export default QueueManagement;
export { QueueManagement };
