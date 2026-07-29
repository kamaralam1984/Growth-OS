"use client";

import { motion } from "framer-motion";

import { Container } from "@/components/ui/container";
import { SectionHeading } from "@/components/ui/section-heading";
import { Card } from "@/components/ui/card";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { fadeInUp, staggerContainer } from "@/animations";
import { SECURITY_PRINCIPLES } from "@/lib/security-content";

function slugify(title: string) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

/**
 * Every entry is sourced 1:1 from src/lib/security-content.ts's
 * SECURITY_PRINCIPLES — the `detail` field is only revealed once a card is
 * expanded, matching this platform's real engineering practices with
 * nothing added here.
 */
function SecurityPrinciples() {
  if (SECURITY_PRINCIPLES.length === 0) {
    return null;
  }

  return (
    <section className="relative py-24 sm:py-32">
      <Container className="flex flex-col items-center gap-14">
        <SectionHeading
          eyebrow="Principles"
          title="The principles behind how we build"
          description="Real engineering practices this codebase follows — expand a card for the detail behind the claim."
        />

        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          className="w-full max-w-3xl"
        >
          <Card className="px-6 sm:px-8">
            <Accordion type="multiple">
              {SECURITY_PRINCIPLES.map((principle) => (
                <motion.div key={principle.title} variants={fadeInUp}>
                  <AccordionItem value={slugify(principle.title)}>
                    <AccordionTrigger>
                      <span className="flex flex-col gap-1">
                        <span className="text-sm font-semibold text-foreground sm:text-base">
                          {principle.title}
                        </span>
                        <span className="text-sm font-normal text-muted-foreground">
                          {principle.description}
                        </span>
                      </span>
                    </AccordionTrigger>
                    <AccordionContent>{principle.detail}</AccordionContent>
                  </AccordionItem>
                </motion.div>
              ))}
            </Accordion>
          </Card>
        </motion.div>
      </Container>
    </section>
  );
}

export default SecurityPrinciples;
export { SecurityPrinciples };
