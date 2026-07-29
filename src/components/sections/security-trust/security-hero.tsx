"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ShieldCheck, ArrowRight, Download } from "lucide-react";

import { Container } from "@/components/ui/container";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fadeInUp, staggerContainer } from "@/animations";

/**
 * Hero for the /trust page. Overview text and both CTAs are deliberately
 * scoped to what's real — see src/lib/security-content.ts's header comment
 * for the full list of claims we've confirmed false and refuse to make.
 * The "Download Security Package" CTA is honestly disabled: no such
 * package exists yet, so it never links anywhere.
 */
function SecurityHero() {
  return (
    <section className="relative overflow-hidden pt-36 pb-24 sm:pt-44 sm:pb-32">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-20 h-[54rem] bg-aurora"
      />

      <Container className="relative">
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className="mx-auto flex max-w-3xl flex-col items-center gap-8 text-center"
        >
          <motion.div variants={fadeInUp}>
            <Badge variant="accent">
              <ShieldCheck />
              Enterprise Ready
            </Badge>
          </motion.div>

          <motion.h1
            variants={fadeInUp}
            className="text-balance text-4xl font-semibold tracking-tight text-foreground sm:text-5xl lg:text-6xl"
          >
            Security & trust,{" "}
            <span className="text-gradient-brand">documented honestly</span>
          </motion.h1>

          <motion.p
            variants={fadeInUp}
            className="max-w-2xl text-balance text-base text-muted-foreground sm:text-lg"
          >
            GrowthOS is built on real, verifiable controls — role-based
            access enforced server-side, sensitive data encrypted at rest
            under independent keys, tamper-evident audit logs, and
            continuous health monitoring. Every claim on this page is backed
            by working code, not a marketing checklist, and we say so
            plainly where something isn&apos;t in place yet.
          </motion.p>

          <motion.div
            variants={fadeInUp}
            className="flex flex-col items-center gap-4 sm:flex-row"
          >
            <Button size="lg" asChild>
              <Link href="/contact?department=SUPPORT">
                Contact Security Team
                <ArrowRight />
              </Link>
            </Button>
            <Button size="lg" variant="outline" disabled title="No downloadable security package exists yet">
              <Download />
              Download Security Package (Coming Soon)
            </Button>
          </motion.div>
        </motion.div>
      </Container>
    </section>
  );
}

export default SecurityHero;
export { SecurityHero };
