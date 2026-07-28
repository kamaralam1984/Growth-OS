"use client";

import { motion } from "framer-motion";
import { CheckCircle2 } from "lucide-react";

import { Container } from "@/components/ui/container";
import { fadeInUp, staggerContainer } from "@/animations";
import { TRUST_BAR_ITEMS } from "@/lib/trust-content";

/** Real, confirmed business policy commitments — not aspirational. */
function EnterpriseTrustBar() {
  if (TRUST_BAR_ITEMS.length === 0) {
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
          {TRUST_BAR_ITEMS.map((item) => (
            <motion.div
              key={item.label}
              variants={fadeInUp}
              className="flex items-center gap-2 text-sm font-medium text-foreground"
            >
              <CheckCircle2 className="size-4 shrink-0 text-primary" strokeWidth={2.5} />
              {item.label}
            </motion.div>
          ))}
        </motion.div>
      </Container>
    </section>
  );
}

export default EnterpriseTrustBar;
export { EnterpriseTrustBar };
