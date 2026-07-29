"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Cpu, ArrowRight, MessageCircle } from "lucide-react";

import { Container } from "@/components/ui/container";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fadeInUp, staggerContainer } from "@/animations";
import { RUNTIME_PROVIDERS } from "@/lib/ai-runtime-content";

/**
 * Hero for the AI Runtime & Reliability page. Overview text and provider
 * badges are deliberately scoped to what's real — see
 * src/lib/ai-runtime-content.ts's header comment for the full list of
 * claims we've confirmed false and refuse to make.
 */
function AiRuntimeHero() {
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
              <Cpu />
              Enterprise Grade
            </Badge>
          </motion.div>

          <motion.h1
            variants={fadeInUp}
            className="text-balance text-4xl font-semibold tracking-tight text-foreground sm:text-5xl lg:text-6xl"
          >
            An AI runtime built for{" "}
            <span className="text-gradient-brand">reliability</span>
          </motion.h1>

          <motion.p
            variants={fadeInUp}
            className="max-w-2xl text-balance text-base text-muted-foreground sm:text-lg"
          >
            Every AI request runs against a real, multi-provider fallback
            chain — Anthropic Claude as the primary provider, with Groq,
            Google Gemini, and OpenRouter as automatic free-tier fallbacks.
            If one provider fails, the next is tried immediately, in the
            same request. Real token usage is tracked on every call. Here
            is how it actually works, described plainly.
          </motion.p>

          <motion.div
            variants={fadeInUp}
            className="flex flex-wrap items-center justify-center gap-2"
          >
            {RUNTIME_PROVIDERS.map((provider) => (
              <Badge key={provider.name} variant="outline" className="px-3 py-1.5 text-xs">
                {provider.name}
              </Badge>
            ))}
          </motion.div>

          <motion.div
            variants={fadeInUp}
            className="flex flex-col items-center gap-4 sm:flex-row"
          >
            <Button size="lg" asChild>
              <a href="#architecture">
                Explore AI Infrastructure
                <ArrowRight />
              </a>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/contact?department=SUPPORT">
                <MessageCircle />
                Contact AI Experts
              </Link>
            </Button>
          </motion.div>
        </motion.div>
      </Container>
    </section>
  );
}

export default AiRuntimeHero;
export { AiRuntimeHero };
