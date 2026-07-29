"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";

import { Container } from "@/components/ui/container";
import { SectionHeading } from "@/components/ui/section-heading";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { fadeInUp, staggerContainer } from "@/animations";
import { MONITORING_STAGES } from "@/lib/security-content";

/**
 * Real, code-verified monitoring behavior — see
 * src/lib/security-content.ts's header comment. The status page linked
 * below is a real, live page, not a placeholder.
 */
function MonitoringIncidentResponse() {
  if (MONITORING_STAGES.length === 0) {
    return null;
  }

  return (
    <section className="relative py-24 sm:py-32">
      <Container className="flex flex-col items-center gap-14">
        <SectionHeading
          eyebrow="Monitoring & incident response"
          title="Watched continuously, not checked occasionally"
          description="From detection to public disclosure — here's what actually happens when something breaks."
        />

        <motion.ol
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          className="flex w-full flex-col gap-8 lg:flex-row lg:items-start lg:gap-0"
        >
          {MONITORING_STAGES.map((stage, index) => {
            const isLast = index === MONITORING_STAGES.length - 1;
            return (
              <motion.li
                key={stage.stage}
                variants={fadeInUp}
                className="relative flex flex-1 gap-4 lg:flex-col lg:items-center lg:gap-3 lg:text-center"
              >
                <div className="flex flex-col items-center">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full border border-primary/30 bg-background text-sm font-semibold text-primary">
                    {index + 1}
                  </span>
                  {!isLast && (
                    <span
                      aria-hidden
                      className="mt-1 w-px flex-1 bg-border lg:absolute lg:left-[calc(50%+20px)] lg:right-0 lg:top-5 lg:mt-0 lg:h-px lg:w-auto"
                    />
                  )}
                </div>
                <div className="flex flex-col gap-1 pb-2 lg:px-4 lg:pb-0">
                  <h3 className="text-sm font-semibold text-foreground">{stage.stage}</h3>
                  <p className="text-sm text-muted-foreground">{stage.description}</p>
                </div>
              </motion.li>
            );
          })}
        </motion.ol>

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

export default MonitoringIncidentResponse;
export { MonitoringIncidentResponse };
