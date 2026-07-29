"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";

import { Container } from "@/components/ui/container";
import { SectionHeading } from "@/components/ui/section-heading";
import { Card } from "@/components/ui/card";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { fadeInUp, staggerContainer, DURATIONS, EASES } from "@/animations";
import { COMPLIANCE_FRAMEWORKS, type ComplianceFrameworkSummary } from "@/lib/security-content";

const STATUS_VARIANT: Record<ComplianceFrameworkSummary["status"], BadgeProps["variant"]> = {
  "Architecture Ready": "accent",
  Partial: "outline",
  "Available on Request": "secondary",
};

/**
 * Restricted to claims independently verified against this codebase — see
 * src/lib/security-content.ts's header comment. Every framework's
 * description already carries the full "architectural-readiness snapshot,
 * not a certification" disclaimer inline — it's rendered in full here,
 * never truncated or summarized away.
 */
function ComplianceCenter() {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (COMPLIANCE_FRAMEWORKS.length === 0) {
    return null;
  }

  return (
    <section className="relative py-24 sm:py-32">
      <Container className="flex flex-col items-center gap-14">
        <SectionHeading
          eyebrow="Compliance center"
          title="Where we stand, framework by framework"
          description="A real architectural-readiness snapshot — tap a framework for the full, unedited detail, including what it doesn't mean."
        />

        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {COMPLIANCE_FRAMEWORKS.map((entry) => {
            const isOpen = expanded === entry.framework;
            return (
              <motion.div key={entry.framework} variants={fadeInUp}>
                <Card glass className="flex flex-col gap-3 p-5">
                  <button
                    type="button"
                    onClick={() => setExpanded(isOpen ? null : entry.framework)}
                    aria-expanded={isOpen}
                    className="flex w-full items-center justify-between gap-3 text-left"
                  >
                    <span className="flex flex-1 flex-wrap items-center gap-2.5">
                      <span className="text-sm font-semibold text-foreground">{entry.framework}</span>
                      <Badge variant={STATUS_VARIANT[entry.status]}>{entry.status}</Badge>
                    </span>
                    <ChevronDown
                      className={`size-4 shrink-0 text-muted-foreground transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`}
                    />
                  </button>
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: DURATIONS.base, ease: EASES.outExpo }}
                        className="overflow-hidden"
                      >
                        <p className="text-sm text-muted-foreground">{entry.description}</p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </Card>
              </motion.div>
            );
          })}
        </motion.div>
      </Container>
    </section>
  );
}

export default ComplianceCenter;
export { ComplianceCenter };
