"use client";

import { motion } from "framer-motion";
import { ArrowRight, PhoneCall } from "lucide-react";

import { Container } from "@/components/ui/container";
import { Button } from "@/components/ui/button";
import { fadeInUp, staggerContainer } from "@/animations";

function CTA() {
  return (
    <section className="relative overflow-hidden py-24 sm:py-32">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-radial-fade"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 size-[36rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/10 blur-[140px]"
      />

      <Container className="relative">
        <motion.div
          className="mx-auto flex max-w-3xl flex-col items-center gap-8 rounded-2xl border border-border glass-panel-strong px-8 py-16 text-center shadow-elevated shadow-glow-primary sm:px-16"
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
        >
          <motion.h2
            variants={fadeInUp}
            className="text-balance text-3xl font-semibold tracking-tight text-foreground sm:text-4xl lg:text-5xl"
          >
            Put your growth engine on{" "}
            <span className="text-gradient-brand">autopilot</span>
          </motion.h2>

          <motion.p
            variants={fadeInUp}
            className="max-w-xl text-balance text-base text-muted-foreground sm:text-lg"
          >
            Start qualifying, engaging, and converting pipeline with AI agents
            today. No credit card required, and your first workflow can be
            live in under fifteen minutes.
          </motion.p>

          <motion.div
            variants={fadeInUp}
            className="flex flex-col items-center gap-4 sm:flex-row"
          >
            <Button size="lg">
              Start free trial
              <ArrowRight />
            </Button>
            <Button size="lg" variant="outline">
              <PhoneCall />
              Talk to sales
            </Button>
          </motion.div>
        </motion.div>
      </Container>
    </section>
  );
}

export default CTA;
export { CTA };
