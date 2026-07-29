"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { DatabaseBackup, FileClock, ClipboardList, ArrowRight } from "lucide-react";

import { Container } from "@/components/ui/container";
import { SectionHeading } from "@/components/ui/section-heading";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { fadeInUp, staggerContainer } from "@/animations";

/**
 * Not data-driven from src/lib/ai-runtime-content.ts — this section is
 * about platform-wide reliability (backups, disaster recovery, incident
 * tracking), not AI-runtime-specific facts, so it reuses the same
 * real, code-verified claims already established this session in
 * src/lib/security-content.ts (see ACCESS_CONTROL/INFRASTRUCTURE_SECURITY's
 * "Automated Backups" entry and the "Business Continuity" principle) and
 * docs/operations/disaster-recovery.md, restated directly here.
 *
 * Deliberately NOT included: a fabricated "Resilience Score", a fabricated
 * uptime percentage, or a fabricated incident count. Real historical
 * uptime lives on the actual public /status page, linked below instead of
 * being restated as a number here.
 */
const RELIABILITY_ITEMS = [
  {
    icon: DatabaseBackup,
    title: "Automated Nightly Backups",
    description:
      "A verified, SHA-256 checksummed database backup runs automatically every night — a real scheduled job, not a manual or occasional task.",
  },
  {
    icon: FileClock,
    title: "A Documented Disaster-Recovery Runbook",
    description:
      "A concrete, runnable runbook with real backup and restore commands, and an honestly-stated estimated recovery time — not a guaranteed SLA, and not a vague promise.",
  },
  {
    icon: ClipboardList,
    title: "Real Incident Tracking",
    description:
      "Incidents are logged, tracked to resolution, and reviewed — not handled ad hoc — with customer-facing incidents disclosed publicly on our status page.",
  },
];

function ReliabilityCenter() {
  return (
    <section className="relative py-24 sm:py-32">
      <Container className="flex flex-col items-center gap-14">
        <SectionHeading
          eyebrow="Reliability"
          title="Built to recover, not just built to run"
          description="Backups, a real disaster-recovery process, and incident tracking — described honestly, with an estimate instead of a guarantee where a guarantee wouldn't be true."
        />

        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          className="grid w-full grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3"
        >
          {RELIABILITY_ITEMS.map((item) => (
            <motion.div key={item.title} variants={fadeInUp} className="h-full">
              <Card glass className="flex h-full flex-col gap-4 p-6">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <item.icon className="size-5" strokeWidth={2} />
                </span>
                <span className="text-base font-semibold text-foreground">{item.title}</span>
                <p className="flex-1 text-sm text-muted-foreground">{item.description}</p>
              </Card>
            </motion.div>
          ))}
        </motion.div>

        <motion.div
          variants={fadeInUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-40px" }}
          className="w-full"
        >
          <Card glass className="flex flex-col items-center gap-4 p-8 text-center sm:flex-row sm:justify-between sm:text-left">
            <div className="flex flex-col gap-1">
              <h3 className="text-base font-semibold text-foreground">Real historical uptime, publicly visible</h3>
              <p className="text-sm text-muted-foreground">
                Live health checks and incident history — not a marketing claim.
              </p>
            </div>
            <Button size="lg" asChild>
              <Link href="/status">
                View real-time system status
                <ArrowRight />
              </Link>
            </Button>
          </Card>
        </motion.div>
      </Container>
    </section>
  );
}

export default ReliabilityCenter;
export { ReliabilityCenter };
