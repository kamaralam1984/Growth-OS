"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
  Crown,
  Handshake,
  Megaphone,
  FileSignature,
  Send,
  type LucideIcon,
} from "lucide-react";

import { fadeInUp, glowPulse, staggerContainer } from "@/animations";
import { Card } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { SectionHeading } from "@/components/ui/section-heading";
import { TiltCard } from "@/components/ui/tilt-card";
import { cn } from "@/lib/utils";

type AccentColor = "rose" | "emerald" | "blue" | "amber";

interface Agent {
  name: string;
  role: string;
  description: string;
  icon: LucideIcon;
  status: string;
  accent: AccentColor;
  delay: number;
}

const ACCENT_STYLE = {
  icon: "border-primary/20 bg-primary/10 text-primary",
  dot: "bg-primary",
  text: "text-primary",
};

const ACCENT_CLASSES: Record<
  AccentColor,
  { icon: string; dot: string; text: string }
> = {
  rose: ACCENT_STYLE,
  emerald: ACCENT_STYLE,
  blue: ACCENT_STYLE,
  amber: ACCENT_STYLE,
};

const AGENTS: Agent[] = [
  {
    name: "CEO AI",
    role: "Strategy & prioritization",
    description:
      "Reviews pipeline health every morning and tells your team exactly what to work on next.",
    icon: Crown,
    status: "prioritizing",
    accent: "rose",
    delay: 0,
  },
  {
    name: "Sales AI",
    role: "Lead qualification",
    description:
      "Scores inbound leads on fit and intent, then engages the ones worth a rep's time.",
    icon: Handshake,
    status: "qualifying",
    accent: "emerald",
    delay: 0.5,
  },
  {
    name: "Marketing AI",
    role: "Content & campaigns",
    description:
      "Plans and ships campaign content across channels, tuned to what's converting this week.",
    icon: Megaphone,
    status: "publishing",
    accent: "blue",
    delay: 1,
  },
  {
    name: "Proposal AI",
    role: "Proposals & quotes",
    description:
      "Drafts tailored proposals and quotes from deal context in minutes, not days.",
    icon: FileSignature,
    status: "drafting",
    accent: "amber",
    delay: 1.5,
  },
  {
    name: "Outreach AI",
    role: "Cold email & LinkedIn",
    description:
      "Runs personalized email and LinkedIn sequences, and follows up until someone replies.",
    icon: Send,
    status: "sending",
    accent: "emerald",
    delay: 2,
  },
];

function AIAgents() {
  return (
    <section className="relative py-24 sm:py-32">
      <Container className="flex flex-col items-center gap-16">
        <SectionHeading
          eyebrow="Meet your AI workforce"
          title={
            <>
              Five specialized agents,{" "}
              <span className="text-gradient-brand">working as one team</span>
            </>
          }
          description="Each agent owns a piece of your growth engine end-to-end — no hand-offs, no dropped threads, no waiting for someone to log in."
        />

        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          className="grid w-full grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-5"
        >
          {AGENTS.map((agent) => {
            const accent = ACCENT_CLASSES[agent.accent];
            const Icon = agent.icon;

            return (
              <motion.div key={agent.name} variants={fadeInUp} className="h-full">
                <TiltCard className="h-full">
                  <Card glass className="flex h-full flex-col gap-5 p-6">
                    <span
                      className={cn(
                        "inline-flex size-11 items-center justify-center rounded-xl border",
                        accent.icon,
                      )}
                    >
                      <Icon className="size-5" strokeWidth={2} />
                    </span>

                    <div className="flex flex-col gap-1.5">
                      <h3 className="text-base font-semibold tracking-tight text-foreground">
                        {agent.name}
                      </h3>
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        {agent.role}
                      </p>
                      <p className="mt-1.5 text-sm text-muted-foreground">
                        {agent.description}
                      </p>
                    </div>

                    <div className="mt-auto flex items-center gap-2 border-t border-border pt-4">
                      <motion.span
                        aria-hidden
                        animate={{
                          ...glowPulse.animate,
                          transition: {
                            ...glowPulse.animate.transition,
                            delay: agent.delay,
                          },
                        }}
                        className={cn("size-1.5 rounded-full", accent.dot)}
                      />
                      <span
                        className={cn(
                          "text-xs font-medium capitalize",
                          accent.text,
                        )}
                      >
                        {agent.status}
                      </span>
                    </div>
                  </Card>
                </TiltCard>
              </motion.div>
            );
          })}
        </motion.div>
      </Container>
    </section>
  );
}

export default AIAgents;
export { AIAgents };
