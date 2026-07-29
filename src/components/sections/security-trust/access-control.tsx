"use client";

import { motion } from "framer-motion";
import { KeyRound, Smartphone, Clock, ScrollText, Terminal, Lock, ShieldCheck, type LucideIcon } from "lucide-react";

import { Container } from "@/components/ui/container";
import { SectionHeading } from "@/components/ui/section-heading";
import { Card } from "@/components/ui/card";
import { fadeInUp, staggerContainer } from "@/animations";
import { ACCESS_CONTROL_ITEMS } from "@/lib/security-content";

const ITEM_ICON: Record<string, LucideIcon> = {
  "Role-Based Access Control": KeyRound,
  "Two-Factor Authentication (TOTP)": Smartphone,
  "Session Security": Clock,
  "Hash-Chained Audit Logs": ScrollText,
  "API Authentication": Terminal,
  "Secrets Vault": Lock,
};

/**
 * Restricted to claims independently verified against this codebase — see
 * src/lib/security-content.ts's header comment. Deliberately omits SSO,
 * passkeys, MFA beyond TOTP, and API-key expiration/rotation, since none
 * of those are real for this deployment.
 */
function AccessControl() {
  if (ACCESS_CONTROL_ITEMS.length === 0) {
    return null;
  }

  return (
    <section className="relative py-24 sm:py-32">
      <Container className="flex flex-col items-center gap-14">
        <SectionHeading
          eyebrow="Access control"
          title="Who can do what, and how it's enforced"
          description="Every claim below is backed by working code in this platform."
        />

        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          className="grid w-full grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3"
        >
          {ACCESS_CONTROL_ITEMS.map((item) => {
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

export default AccessControl;
export { AccessControl };
