"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
  UserSearch,
  LayoutGrid,
  ClipboardList,
  Clock3,
  ScanSearch,
  Layers,
  Sparkles,
  Flame,
  type LucideIcon,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { SectionHeading } from "@/components/ui/section-heading";
import { Container } from "@/components/ui/container";
import { fadeInUp, staggerContainer } from "@/animations";

interface Point {
  icon: LucideIcon;
  title: string;
  description: string;
}

const PROBLEMS: Point[] = [
  {
    icon: UserSearch,
    title: "Manual prospecting",
    description:
      "Reps spend hours a day hand-building lead lists instead of talking to prospects.",
  },
  {
    icon: LayoutGrid,
    title: "Scattered tools",
    description:
      "Email, LinkedIn, and the CRM live in five different tabs that never sync with each other.",
  },
  {
    icon: ClipboardList,
    title: "Drowning in admin",
    description:
      "Every booked meeting means 20 minutes of manual notes, scheduling, and data entry.",
  },
  {
    icon: Clock3,
    title: "Leads go cold",
    description:
      "Without consistent follow-up, most inbound leads go quiet after one unanswered email.",
  },
];

const SOLUTIONS: Point[] = [
  {
    icon: ScanSearch,
    title: "AI sources & qualifies, 24/7",
    description:
      "Agents identify and score every lead against your ICP the instant it arrives, day or night.",
  },
  {
    icon: Layers,
    title: "One unified system",
    description:
      "Enrichment, outreach, and CRM sync run in a single platform, no integrations to babysit.",
  },
  {
    icon: Sparkles,
    title: "Zero manual admin",
    description:
      "Notes, scheduling, and CRM updates happen automatically the moment a call ends.",
  },
  {
    icon: Flame,
    title: "Every lead followed up",
    description:
      "Persistent AI follow-up keeps every deal warm until a prospect is ready to talk.",
  },
];

function ProblemSolution() {
  return (
    <section id="problem-solution" className="relative py-24 sm:py-32">
      <Container className="flex flex-col items-center gap-16">
        <SectionHeading
          eyebrow="The shift"
          title={
            <>
              Stop running sales like it&apos;s 2015.{" "}
              <span className="text-gradient-brand">Let AI run it like it&apos;s 2026.</span>
            </>
          }
          description="Most teams are still stitching together point tools and manual busywork. GrowthOS replaces that entire stack with autonomous agents that run acquisition end to end."
        />

        <motion.div
          className="grid w-full grid-cols-1 gap-6 lg:grid-cols-2"
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
        >
          {/* The old way */}
          <motion.div variants={fadeInUp}>
            <Card className="h-full grayscale-[35%]">
              <CardHeader>
                <span className="inline-flex w-fit items-center rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  The old way
                </span>
                <CardTitle className="mt-4 text-foreground/70">
                  Manual, scattered, reactive
                </CardTitle>
                <CardDescription>
                  Reps and tools working against each other instead of together.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="flex flex-col gap-6">
                  {PROBLEMS.map((point) => {
                    const Icon = point.icon;
                    return (
                      <li key={point.title} className="flex items-start gap-4">
                        <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl border border-border bg-muted text-muted-foreground">
                          <Icon className="size-4.5" strokeWidth={2} />
                        </span>
                        <div className="flex flex-col gap-0.5 pt-1">
                          <p className="text-sm font-medium text-foreground/70">
                            {point.title}
                          </p>
                          <p className="text-sm leading-relaxed text-muted-foreground">
                            {point.description}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>
          </motion.div>

          {/* The GrowthOS way */}
          <motion.div variants={fadeInUp}>
            <Card
              glass
              className="h-full border-primary/25 shadow-glow-primary"
            >
              <CardHeader>
                <span className="inline-flex w-fit items-center rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-medium uppercase tracking-wider text-primary">
                  The GrowthOS way
                </span>
                <CardTitle className="mt-4">Autonomous, unified, always-on</CardTitle>
                <CardDescription>
                  AI agents running acquisition end to end, without waiting on a rep.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="flex flex-col gap-6">
                  {SOLUTIONS.map((point) => {
                    const Icon = point.icon;
                    return (
                      <li key={point.title} className="flex items-start gap-4">
                        <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
                          <Icon className="size-4.5" strokeWidth={2} />
                        </span>
                        <div className="flex flex-col gap-0.5 pt-1">
                          <p className="text-sm font-medium text-foreground">
                            {point.title}
                          </p>
                          <p className="text-sm leading-relaxed text-muted-foreground">
                            {point.description}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>
          </motion.div>
        </motion.div>
      </Container>
    </section>
  );
}

export default ProblemSolution;
export { ProblemSolution };
