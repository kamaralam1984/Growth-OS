"use client";

import { motion } from "framer-motion";
import { Lock, ShieldCheck, ScrollText, KeyRound, Gauge, Building2, type LucideIcon } from "lucide-react";

import { Container } from "@/components/ui/container";
import { SectionHeading } from "@/components/ui/section-heading";
import { Card } from "@/components/ui/card";
import { fadeInUp, staggerContainer } from "@/animations";
import { AI_SECURITY_ITEMS } from "@/lib/ai-runtime-content";

const ITEM_ICON: Record<string, LucideIcon> = {
  "Encrypted Secrets": Lock,
  "Request Validation": ShieldCheck,
  "Hash-Chained Audit Logs": ScrollText,
  "Role-Based Access": KeyRound,
  "Rate Limiting": Gauge,
  "Tenant Data Isolation": Building2,
};

/**
 * Restricted to claims independently verified against this codebase — see
 * src/lib/ai-runtime-content.ts's header comment. Reuses the same real
 * facts as the Security & Compliance Trust Center, framed for AI
 * specifically.
 */
function AiSecurity() {
  if (AI_SECURITY_ITEMS.length === 0) {
    return null;
  }

  return (
    <section className="relative py-24 sm:py-32">
      <Container className="flex flex-col items-center gap-14">
        <SectionHeading
          eyebrow="AI security"
          title="Every AI request runs inside the same real controls"
          description="AI features don't get a separate, weaker security model — they run through the same code-verified controls as the rest of the platform."
        />

        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          className="grid w-full grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3"
        >
          {AI_SECURITY_ITEMS.map((item) => {
            const Icon = ITEM_ICON[item.title] ?? ShieldCheck;
            return (
              <motion.div key={item.title} variants={fadeInUp} className="h-full">
                <Card glass className="flex h-full flex-col gap-4 p-6">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Icon className="size-5" strokeWidth={2} />
                  </span>
                  <span className="text-base font-semibold text-foreground">{item.title}</span>
                  <p className="flex-1 text-sm text-muted-foreground">{item.description}</p>
                </Card>
              </motion.div>
            );
          })}
        </motion.div>
      </Container>
    </section>
  );
}

export default AiSecurity;
export { AiSecurity };
