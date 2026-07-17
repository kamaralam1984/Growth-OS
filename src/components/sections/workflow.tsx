"use client";

import * as React from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import {
  Inbox,
  Bot,
  ScanSearch,
  Building2,
  FileText,
  Mail,
  UserPlus,
  CalendarCheck,
  RefreshCw,
  Trophy,
  type LucideIcon,
} from "lucide-react";

import { SectionHeading } from "@/components/ui/section-heading";
import { Container } from "@/components/ui/container";
import { EASES } from "@/animations";
import { cn } from "@/lib/utils";

type Accent = "emerald" | "blue" | "amber";

interface Step {
  icon: LucideIcon;
  accent: Accent;
  title: string;
  description: string;
}

const ACCENT_STYLES: Record<Accent, string> = {
  emerald: "border-emerald-500/20 bg-emerald-500/10 text-emerald-500",
  blue: "border-blue-500/20 bg-blue-500/10 text-blue-500",
  amber: "border-amber-500/20 bg-amber-500/10 text-amber-500",
};

const STEPS: Step[] = [
  {
    icon: Inbox,
    accent: "emerald",
    title: "Lead Arrives",
    description:
      "A new inbound lead or sourced contact lands in GrowthOS from your site, ads, or a prospecting list.",
  },
  {
    icon: Bot,
    accent: "blue",
    title: "AI Meeting",
    description:
      "An AI agent reviews the inbound signal in real time, extracting intent, urgency, and context before a rep ever gets involved.",
  },
  {
    icon: ScanSearch,
    accent: "emerald",
    title: "Lead Analysis",
    description:
      "The lead is scored and qualified against your ICP, filtering out poor fits before they reach a rep.",
  },
  {
    icon: Building2,
    accent: "amber",
    title: "Company Research",
    description:
      "The agent enriches the record with firmographic data, tech stack, and recent company activity.",
  },
  {
    icon: FileText,
    accent: "emerald",
    title: "Proposal Generation",
    description:
      "A tailored proposal is drafted from the enriched profile, ready for a rep to review and send.",
  },
  {
    icon: Mail,
    accent: "blue",
    title: "Cold Email",
    description:
      "A personalized, multi-touch email sequence goes out automatically, tuned to the prospect's role and industry.",
  },
  {
    icon: UserPlus,
    accent: "blue",
    title: "LinkedIn Outreach",
    description:
      "Connection requests and follow-up messages go out on LinkedIn to reinforce the email sequence.",
  },
  {
    icon: CalendarCheck,
    accent: "amber",
    title: "Meeting Booked",
    description:
      "The agent handles scheduling back-and-forth and locks a meeting directly onto a rep's calendar.",
  },
  {
    icon: RefreshCw,
    accent: "emerald",
    title: "CRM Sync",
    description:
      "Every touchpoint, note, and status change syncs to your CRM automatically, with zero manual entry.",
  },
  {
    icon: Trophy,
    accent: "blue",
    title: "Deal Closed",
    description:
      "Won deals trigger the onboarding handoff while GrowthOS moves the next qualified lead into the pipeline.",
  },
];

function StepItem({ step, index }: { step: Step; index: number }) {
  const Icon = step.icon;

  return (
    <motion.li
      className="relative flex min-w-0 items-start gap-5 pl-0.5 sm:gap-6"
      initial={{ opacity: 0, x: 28 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true, margin: "-100px" }}
      transition={{ duration: 0.55, ease: EASES.outExpo }}
    >
      <span
        className={cn(
          "relative z-10 flex size-10 shrink-0 items-center justify-center rounded-full border bg-background shadow-card sm:size-11",
          ACCENT_STYLES[step.accent],
        )}
      >
        <Icon className="size-4.5 sm:size-5" strokeWidth={2} />
      </span>

      <div className="flex min-w-0 flex-col gap-1 pb-1 pt-1 sm:pt-1.5">
        <span className="font-mono text-xs font-medium tracking-wider text-muted-foreground">
          Step {String(index + 1).padStart(2, "0")}
        </span>
        <h3 className="text-base font-semibold tracking-tight text-foreground sm:text-lg">
          {step.title}
        </h3>
        <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
          {step.description}
        </p>
      </div>
    </motion.li>
  );
}

function Workflow() {
  const containerRef = React.useRef<HTMLDivElement>(null);

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start 0.75", "end 0.6"],
  });

  const scaleY = useTransform(scrollYProgress, [0, 1], [0, 1]);

  return (
    <section id="how-it-works" className="relative py-24 sm:py-32">
      <Container className="flex flex-col items-center gap-16">
        <SectionHeading
          eyebrow="How AI Works"
          title={
            <>
              From first touch to closed deal,{" "}
              <span className="text-gradient-brand">fully autonomous</span>
            </>
          }
          description="Ten stages, one continuous pipeline. GrowthOS agents carry every lead from first signal to closed-won without a rep lifting a finger."
        />

        <div ref={containerRef} className="relative w-full max-w-2xl">
          {/* Base line */}
          <div
            aria-hidden
            className="absolute left-5 top-1 bottom-1 w-px -translate-x-1/2 bg-border sm:left-[22px]"
          />
          {/* Scroll-filled progress line */}
          <motion.div
            aria-hidden
            style={{ scaleY }}
            className="absolute left-5 top-1 bottom-1 w-px -translate-x-1/2 origin-top bg-primary sm:left-[22px]"
          />

          <ol className="relative flex flex-col gap-10 sm:gap-12">
            {STEPS.map((step, index) => (
              <StepItem key={step.title} step={step} index={index} />
            ))}
          </ol>
        </div>
      </Container>
    </section>
  );
}

export default Workflow;
export { Workflow };
