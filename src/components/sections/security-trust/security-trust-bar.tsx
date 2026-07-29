"use client";

import { motion } from "framer-motion";
import { CheckCircle2 } from "lucide-react";

import { Container } from "@/components/ui/container";
import { fadeInUp, staggerContainer } from "@/animations";
import { SECURITY_TRUST_BADGES } from "@/lib/security-content";

/** Real, code-verified security claims — not marketing badges. */
function SecurityTrustBar() {
  if (SECURITY_TRUST_BADGES.length === 0) {
    return null;
  }

  return (
    <section className="relative border-y border-border bg-muted/20 py-8">
      <Container>
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-40px" }}
          className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3"
        >
          {SECURITY_TRUST_BADGES.map((badge) => (
            <motion.div
              key={badge.label}
              variants={fadeInUp}
              className="flex items-center gap-2 text-sm font-medium text-foreground"
            >
              <CheckCircle2 className="size-4 shrink-0 text-primary" strokeWidth={2.5} />
              {badge.label}
            </motion.div>
          ))}
        </motion.div>
      </Container>
    </section>
  );
}

export default SecurityTrustBar;
export { SecurityTrustBar };
