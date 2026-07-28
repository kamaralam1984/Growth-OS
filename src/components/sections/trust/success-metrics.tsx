"use client";

import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";

import { Container } from "@/components/ui/container";
import { SectionHeading } from "@/components/ui/section-heading";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AnimatedCounter } from "@/components/ui/animated-counter";
import { fadeInUp, staggerContainer, DURATIONS } from "@/animations";
import { SUCCESS_METRICS } from "@/lib/trust-content";

/**
 * Animated counter grid for track-record metrics — the kind of thing this
 * section is for once real numbers exist: projects delivered, clients
 * served, countries reached, retention rate, support response time,
 * on-time delivery rate, etc. SUCCESS_METRICS is deliberately empty until
 * this deployment has real performance data to report (see
 * src/lib/trust-content.ts's header comment) — never fabricate example
 * entries here. Populate the array there and this component renders the
 * populated grid with no changes needed here.
 */
function SuccessMetrics() {
  const hasMetrics = SUCCESS_METRICS.length > 0;

  return (
    <section className="relative py-24 sm:py-32">
      <Container className="flex flex-col items-center gap-14">
        <SectionHeading
          eyebrow="Track record"
          title={
            <>
              Results, measured{" "}
              <span className="text-gradient-brand">not just promised</span>
            </>
          }
          description="The numbers behind every engagement — updated as real outcomes come in."
        />

        {hasMetrics ? (
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            className="grid w-full grid-cols-2 gap-8 sm:grid-cols-3 lg:grid-cols-6"
          >
            {SUCCESS_METRICS.map((metric) => (
              <motion.div
                key={metric.label}
                variants={fadeInUp}
                className="flex flex-col items-center gap-1.5 text-center"
              >
                <span className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                  <AnimatedCounter
                    value={metric.value}
                    prefix={metric.prefix}
                    suffix={metric.suffix}
                    duration={DURATIONS.slower}
                  />
                </span>
                <span className="text-balance text-xs font-medium text-foreground sm:text-sm">
                  {metric.label}
                </span>
                <span className="text-balance text-xs text-muted-foreground">
                  {metric.description}
                </span>
              </motion.div>
            ))}
          </motion.div>
        ) : (
          <Card glass className="w-full max-w-xl">
            <CardHeader>
              <div className="flex items-center gap-2">
                <CardTitle>Success metrics</CardTitle>
                <Badge variant="accent">Coming soon</Badge>
              </div>
              <CardDescription>
                Real performance numbers will appear here once this
                deployment has a track record to report.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border py-12 text-center">
                <Sparkles className="size-6 text-muted-foreground" />
                <p className="max-w-sm text-sm text-muted-foreground">
                  This isn&apos;t built yet — check back in a future release.
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </Container>
    </section>
  );
}

export default SuccessMetrics;
export { SuccessMetrics };
