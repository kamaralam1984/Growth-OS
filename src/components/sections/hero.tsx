"use client";

import * as React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Play, Sparkles } from "lucide-react";

import { DURATIONS, fadeInUp, staggerContainer, textReveal } from "@/animations";
import { cn } from "@/lib/utils";
import { AnimatedCounter } from "@/components/ui/animated-counter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { MagneticButton } from "@/components/ui/magnetic-button";
import { Spotlight } from "@/components/ui/spotlight";
import { DashboardPreview } from "@/components/sections/dashboard-preview";

const HEADLINE_LINE_ONE = ["The", "AI", "Workforce", "That"] as const;
const HEADLINE_LINE_TWO = ["Grows", "Your", "Business", "24/7"] as const;

const STATS = [
  {
    value: 3.2,
    decimals: 1,
    suffix: "x",
    label: "more qualified pipeline per quarter",
  },
  {
    value: 40,
    decimals: 0,
    suffix: "%",
    label: "faster lead-to-close velocity",
  },
  {
    value: 24,
    decimals: 0,
    suffix: "/7",
    label: "agents working, nights and weekends",
  },
  {
    value: 6,
    decimals: 0,
    suffix: "hrs",
    label: "of manual prospecting removed weekly",
  },
] as const;

function RevealLine({
  words,
  className,
  wordClassName,
}: {
  words: readonly string[];
  className?: string;
  wordClassName?: string;
}) {
  return (
    <span className={className}>
      {words.map((word) => (
        <motion.span
          key={word}
          variants={textReveal}
          className={cn("mr-[0.28ch] inline-block last:mr-0", wordClassName)}
        >
          {word}
        </motion.span>
      ))}
    </span>
  );
}

function Hero() {
  return (
    <section
      id="top"
      className="relative overflow-hidden pt-36 pb-0 sm:pt-44"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-20 h-[54rem] bg-aurora"
      />

      <Spotlight className="bg-noise" size={520}>
        <Container className="relative">
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
            className="mx-auto flex max-w-4xl flex-col items-center gap-8 text-center"
          >
            <motion.div variants={fadeInUp}>
              <Badge variant="accent">
                <Sparkles />
                AI Workforce for Business Growth
              </Badge>
            </motion.div>

            <motion.h1
              variants={staggerContainer}
              className="text-balance text-4xl font-semibold tracking-tight text-foreground sm:text-5xl lg:text-6xl"
            >
              <RevealLine words={HEADLINE_LINE_ONE} className="block" />
              <RevealLine
                words={HEADLINE_LINE_TWO}
                className="block"
                wordClassName="text-gradient-rosegold"
              />
            </motion.h1>

            <motion.p
              variants={fadeInUp}
              className="max-w-2xl text-balance text-base text-muted-foreground sm:text-lg"
            >
              GrowthOS isn&apos;t software you have to run — it&apos;s a team
              of five AI agents that runs itself. They prioritize your
              pipeline, qualify inbound leads, draft proposals, and send
              outreach sequences around the clock, so deals move forward
              whether or not anyone&apos;s logged in.
            </motion.p>

            <motion.div
              variants={fadeInUp}
              className="flex flex-col items-center gap-4 sm:flex-row"
            >
              <MagneticButton>
                <Button size="lg" asChild>
                  <Link href="/register">
                    Start free trial
                    <ArrowRight />
                  </Link>
                </Button>
              </MagneticButton>
              <MagneticButton>
                <Button size="lg" variant="outline">
                  <Play />
                  Watch demo
                </Button>
              </MagneticButton>
            </motion.div>

            <motion.div
              variants={fadeInUp}
              className="mt-8 grid w-full grid-cols-2 gap-6 border-t border-border pt-10 sm:grid-cols-4"
            >
              {STATS.map((stat) => (
                <div
                  key={stat.label}
                  className="flex flex-col items-center gap-1.5"
                >
                  <span className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                    <AnimatedCounter
                      value={stat.value}
                      suffix={stat.suffix}
                      decimals={stat.decimals}
                      duration={DURATIONS.slower}
                    />
                  </span>
                  <span className="text-balance text-xs text-muted-foreground sm:text-sm">
                    {stat.label}
                  </span>
                </div>
              ))}
            </motion.div>
          </motion.div>
        </Container>
      </Spotlight>

      <div className="relative mt-16 sm:mt-24">
        <DashboardPreview />
      </div>
    </section>
  );
}

export default Hero;
export { Hero };
