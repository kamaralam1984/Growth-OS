"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ShieldCheck } from "lucide-react";

import { Container } from "@/components/ui/container";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fadeInUp, staggerContainer } from "@/animations";

function AdminPlatformHero() {
  return (
    <section className="relative overflow-hidden py-24 sm:py-32">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[40rem] bg-aurora" />
      <Container>
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className="mx-auto flex max-w-3xl flex-col items-center gap-6 text-center"
        >
          <motion.div variants={fadeInUp}>
            <Badge variant="accent">
              <ShieldCheck />
              Enterprise Admin Platform
            </Badge>
          </motion.div>
          <motion.h1 variants={fadeInUp} className="text-balance text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            Built for serious organizations
          </motion.h1>
          <motion.p variants={fadeInUp} className="max-w-xl text-balance text-base text-muted-foreground sm:text-lg">
            A real operational console for security, compliance, billing, and platform health — with an honest list of
            what&apos;s still on our roadmap, not a dashboard full of placeholders.
          </motion.p>
          <motion.div variants={fadeInUp}>
            <Button asChild>
              <Link href="/contact?department=ENTERPRISE">Talk to sales about enterprise admin</Link>
            </Button>
          </motion.div>
        </motion.div>
      </Container>
    </section>
  );
}

export default AdminPlatformHero;
export { AdminPlatformHero };
