"use client";

import { motion } from "framer-motion";
import { CheckCircle2 } from "lucide-react";

import { Container } from "@/components/ui/container";
import { SectionHeading } from "@/components/ui/section-heading";
import { Card } from "@/components/ui/card";
import { fadeInUp, staggerContainer } from "@/animations";
import { REAL_ADMIN_CAPABILITIES } from "@/lib/admin-platform-content";

function RealCapabilities() {
  return (
    <section className="relative py-24 sm:py-32">
      <Container className="flex flex-col items-center gap-14">
        <SectionHeading
          eyebrow="What's real today"
          title="Real operational capability, not mockups"
          description="Every item below is a working feature in the platform today."
        />
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          className="grid w-full grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3"
        >
          {REAL_ADMIN_CAPABILITIES.map((item) => (
            <motion.div key={item.title} variants={fadeInUp}>
              <Card glass className="flex h-full flex-col gap-3 p-6">
                <span className="inline-flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <CheckCircle2 className="size-4" strokeWidth={2.5} />
                </span>
                <h3 className="text-base font-semibold tracking-tight text-foreground">{item.title}</h3>
                <p className="text-sm text-muted-foreground">{item.description}</p>
                <p className="text-xs text-muted-foreground/80">{item.detail}</p>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      </Container>
    </section>
  );
}

export default RealCapabilities;
export { RealCapabilities };
