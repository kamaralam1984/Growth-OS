"use client";

import { motion } from "framer-motion";
import { Compass } from "lucide-react";

import { Container } from "@/components/ui/container";
import { SectionHeading } from "@/components/ui/section-heading";
import { fadeInUp, staggerContainer } from "@/animations";
import { AI_ROADMAP } from "@/lib/ai-runtime-content";

/**
 * Honest, explicitly future-facing roadmap — sourced 1:1 from AI_ROADMAP in
 * src/lib/ai-runtime-content.ts. These are plans, not shipped features; the
 * copy on this section is deliberately careful not to imply any of them are
 * live today.
 */
function AiRoadmap() {
  if (AI_ROADMAP.length === 0) {
    return null;
  }

  return (
    <section className="relative py-24 sm:py-32">
      <Container className="flex flex-col items-center gap-14">
        <SectionHeading
          eyebrow="Roadmap"
          title="What's next"
          description="None of this is built yet — it's where we're headed, told to you honestly instead of dressed up as already live."
        />

        <motion.ol
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          className="flex w-full max-w-3xl flex-col gap-6"
        >
          {AI_ROADMAP.map((item, index) => {
            const isLast = index === AI_ROADMAP.length - 1;
            return (
              <motion.li key={item.title} variants={fadeInUp} className="relative flex gap-4">
                <div className="flex flex-col items-center">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full border border-dashed border-primary/30 bg-background text-primary">
                    <Compass className="size-4" strokeWidth={2.5} />
                  </span>
                  {!isLast && <span aria-hidden className="mt-1 w-px flex-1 bg-border" />}
                </div>
                <div className="flex flex-col gap-1 pb-6">
                  <h3 className="text-sm font-semibold text-foreground">{item.title}</h3>
                  <p className="text-sm text-muted-foreground">{item.description}</p>
                </div>
              </motion.li>
            );
          })}
        </motion.ol>
      </Container>
    </section>
  );
}

export default AiRoadmap;
export { AiRoadmap };
