"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ShieldCheck, ChevronDown } from "lucide-react";

import { Container } from "@/components/ui/container";
import { SectionHeading } from "@/components/ui/section-heading";
import { Card } from "@/components/ui/card";
import { fadeInUp, staggerContainer, DURATIONS, EASES } from "@/animations";
import { SECURITY_BADGES } from "@/lib/trust-content";

/**
 * Restricted to claims independently verified against this codebase — see
 * src/lib/trust-content.ts's header comment. Deliberately excludes
 * firewall/DDoS-protection and any third-party certification/partner
 * badge, since neither is real for this deployment.
 */
function SecurityBadges() {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (SECURITY_BADGES.length === 0) {
    return null;
  }

  return (
    <section className="relative py-24 sm:py-32">
      <Container className="flex flex-col items-center gap-14">
        <SectionHeading
          eyebrow="Security & compliance"
          title="Real security controls, not marketing badges"
          description="Every claim below is backed by working code in this platform — tap a badge for detail."
        />

        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {SECURITY_BADGES.map((badge) => {
            const isOpen = expanded === badge.label;
            return (
              <motion.div key={badge.label} variants={fadeInUp}>
                <Card glass className="flex flex-col gap-3 p-5">
                  <button
                    type="button"
                    onClick={() => setExpanded(isOpen ? null : badge.label)}
                    aria-expanded={isOpen}
                    className="flex w-full items-center justify-between gap-3 text-left"
                  >
                    <span className="flex items-center gap-2.5">
                      <ShieldCheck className="size-4 shrink-0 text-primary" strokeWidth={2.5} />
                      <span className="text-sm font-semibold text-foreground">{badge.label}</span>
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
                        <p className="text-sm text-muted-foreground">{badge.description}</p>
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

export default SecurityBadges;
export { SecurityBadges };
