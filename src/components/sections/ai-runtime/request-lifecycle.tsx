"use client";

import { motion } from "framer-motion";

import { Container } from "@/components/ui/container";
import { SectionHeading } from "@/components/ui/section-heading";
import { fadeInUp, staggerContainer } from "@/animations";
import { LIFECYCLE_STAGES } from "@/lib/ai-runtime-content";

/**
 * The real sequence a request goes through — sourced 1:1 from
 * LIFECYCLE_STAGES in src/lib/ai-runtime-content.ts. No caching stage,
 * since none exists, and no per-provider real-time latency claim.
 */
function RequestLifecycle() {
  if (LIFECYCLE_STAGES.length === 0) {
    return null;
  }

  return (
    <section className="relative py-24 sm:py-32">
      <Container className="flex flex-col items-center gap-14">
        <SectionHeading
          eyebrow="Request lifecycle"
          title="What actually happens on every AI request"
          description="From authentication to the response reaching you — the real sequence, in order."
        />

        <motion.ol
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          className="flex w-full flex-col gap-8 lg:flex-row lg:items-start lg:gap-0"
        >
          {LIFECYCLE_STAGES.map((stage, index) => {
            const isLast = index === LIFECYCLE_STAGES.length - 1;
            return (
              <motion.li
                key={stage.stage}
                variants={fadeInUp}
                className="relative flex flex-1 gap-4 lg:flex-col lg:items-center lg:gap-3 lg:text-center"
              >
                <div className="flex flex-col items-center">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full border border-primary/30 bg-background text-sm font-semibold text-primary">
                    {index + 1}
                  </span>
                  {!isLast && (
                    <span
                      aria-hidden
                      className="mt-1 w-px flex-1 bg-border lg:absolute lg:left-[calc(50%+20px)] lg:right-0 lg:top-5 lg:mt-0 lg:h-px lg:w-auto"
                    />
                  )}
                </div>
                <div className="flex flex-col gap-1 pb-2 lg:px-4 lg:pb-0">
                  <h3 className="text-sm font-semibold text-foreground">{stage.stage}</h3>
                  <p className="text-sm text-muted-foreground">{stage.description}</p>
                </div>
              </motion.li>
            );
          })}
        </motion.ol>
      </Container>
    </section>
  );
}

export default RequestLifecycle;
export { RequestLifecycle };
