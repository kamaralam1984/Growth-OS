"use client";

import { motion } from "framer-motion";
import { Lock } from "lucide-react";

import { Container } from "@/components/ui/container";
import { SectionHeading } from "@/components/ui/section-heading";
import { Card } from "@/components/ui/card";
import { fadeInUp, staggerContainer } from "@/animations";
import { ENCRYPTION_DETAILS } from "@/lib/security-content";

/**
 * Restricted to claims independently verified against this codebase — see
 * src/lib/security-content.ts's header comment. Deliberately omits
 * automated encryption-key rotation, since it isn't real for this
 * deployment.
 */
function EncryptionDetails() {
  if (ENCRYPTION_DETAILS.length === 0) {
    return null;
  }

  return (
    <section className="relative py-24 sm:py-32">
      <Container className="flex flex-col items-center gap-14">
        <SectionHeading
          eyebrow="Encryption"
          title="How data is protected at rest and in transit"
          description="Every claim below is backed by working code in this platform."
        />

        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          className="grid w-full grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3"
        >
          {ENCRYPTION_DETAILS.map((item) => (
            <motion.div key={item.label} variants={fadeInUp} className="h-full">
              <Card glass className="flex h-full flex-col gap-4 p-6">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Lock className="size-5" strokeWidth={2} />
                </span>
                <span className="text-base font-semibold text-foreground">{item.label}</span>
                <p className="flex-1 text-sm text-muted-foreground">{item.description}</p>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      </Container>
    </section>
  );
}

export default EncryptionDetails;
export { EncryptionDetails };
