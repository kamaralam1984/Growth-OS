"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Code2, KeyRound, PlayCircle } from "lucide-react";

import { Container } from "@/components/ui/container";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fadeInUp, staggerContainer } from "@/animations";

/** Real API, real playground, real docs — a small, honest surface (4 endpoints today), not padded with unbuilt features. */
function DeveloperHero() {
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
              <Code2 />
              Developer Platform
            </Badge>
          </motion.div>
          <motion.h1 variants={fadeInUp} className="text-balance text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            Build on GrowthOS
          </motion.h1>
          <motion.p variants={fadeInUp} className="max-w-xl text-balance text-base text-muted-foreground sm:text-lg">
            A real, small API today — 4 documented endpoints, real Bearer-key auth, real rate limits, a working SDK and
            CLI. We&apos;d rather ship an honest, growing surface than a docs site describing features that don&apos;t exist.
          </motion.p>
          <motion.div variants={fadeInUp} className="flex flex-col items-center gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link href="/developers/playground">
                <PlayCircle />
                Try the API Playground
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/dashboard/settings/api-manager">
                <KeyRound />
                Get an API Key
              </Link>
            </Button>
          </motion.div>
        </motion.div>
      </Container>
    </section>
  );
}

export default DeveloperHero;
export { DeveloperHero };
