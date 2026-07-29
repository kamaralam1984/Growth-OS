"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Cloud, Network, Gauge, Box, Archive, ChevronDown, type LucideIcon } from "lucide-react";

import { Container } from "@/components/ui/container";
import { SectionHeading } from "@/components/ui/section-heading";
import { Card } from "@/components/ui/card";
import { fadeInUp, staggerContainer, DURATIONS, EASES } from "@/animations";
import { INFRASTRUCTURE_SECURITY } from "@/lib/security-content";

const INFRASTRUCTURE_ICONS: Record<string, LucideIcon> = {
  "Cloud-Hosted": Cloud,
  "Network Isolation": Network,
  "Rate Limiting": Gauge,
  "Container Hardening": Box,
  "Automated Backups": Archive,
};

/**
 * Restricted to claims independently verified against this codebase — see
 * src/lib/security-content.ts's header comment. Deliberately excludes
 * firewall/WAF/DDoS protection and OS-level server hardening, since neither
 * is real for this deployment.
 */
function InfrastructureSecurity() {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (INFRASTRUCTURE_SECURITY.length === 0) {
    return null;
  }

  return (
    <section className="relative py-24 sm:py-32">
      <Container className="flex flex-col items-center gap-14">
        <SectionHeading
          eyebrow="Infrastructure security"
          title="A hardened, isolated deployment — not just a claim"
          description="Every item below is backed by working infrastructure in this deployment — tap a card for detail."
        />

        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {INFRASTRUCTURE_SECURITY.map((item) => {
            const isOpen = expanded === item.title;
            const Icon = INFRASTRUCTURE_ICONS[item.title] ?? Cloud;
            return (
              <motion.div key={item.title} variants={fadeInUp}>
                <Card glass className="flex flex-col gap-3 p-5">
                  <button
                    type="button"
                    onClick={() => setExpanded(isOpen ? null : item.title)}
                    aria-expanded={isOpen}
                    className="flex w-full items-start justify-between gap-3 text-left"
                  >
                    <span className="flex items-start gap-2.5">
                      <Icon className="size-4 shrink-0 text-primary" strokeWidth={2.5} />
                      <span className="flex flex-col gap-1">
                        <span className="text-sm font-semibold text-foreground">{item.title}</span>
                        <span className="text-sm text-muted-foreground">{item.description}</span>
                      </span>
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
                        <p className="pl-[26px] text-sm text-muted-foreground">{item.detail}</p>
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

export default InfrastructureSecurity;
export { InfrastructureSecurity };
