"use client";

import { motion } from "framer-motion";

import { Container } from "@/components/ui/container";
import { SectionHeading } from "@/components/ui/section-heading";
import { Card } from "@/components/ui/card";
import { fadeInUp, staggerContainer } from "@/animations";
import { CLIENT_JOURNEY_STEPS } from "@/lib/trust-content";

/** The platform's real delivery methodology — how engagements are run. */
function ClientJourney() {
  if (CLIENT_JOURNEY_STEPS.length === 0) {
    return null;
  }

  return (
    <section className="relative py-24 sm:py-32">
      <Container className="flex flex-col items-center gap-14">
        <SectionHeading
          eyebrow="How we work"
          title="A clear path from discovery to support"
          description="Every engagement follows the same disciplined process, end to end."
        />

        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
        >
          {CLIENT_JOURNEY_STEPS.map((step) => (
            <motion.div key={step.step} variants={fadeInUp}>
              <Card glass className="flex h-full flex-col gap-3 p-6">
                <span className="inline-flex size-9 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                  {step.step}
                </span>
                <h3 className="text-base font-semibold tracking-tight text-foreground">{step.title}</h3>
                <p className="text-sm text-muted-foreground">{step.description}</p>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      </Container>
    </section>
  );
}

export default ClientJourney;
export { ClientJourney };
