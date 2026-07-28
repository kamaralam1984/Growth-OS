"use client";

import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";

import { Container } from "@/components/ui/container";
import { SectionHeading } from "@/components/ui/section-heading";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fadeInUp, staggerContainer } from "@/animations";
import { BUSINESS_IMPACT_STATS } from "@/lib/trust-content";

/**
 * The most visually impactful stat section — large, high-contrast cards
 * for point-in-time business-impact claims (e.g. a percentage lift or a
 * multiplier like "3X"). Values are pre-formatted strings, not counting-up
 * numbers, so cards fade/scale in on scroll rather than using
 * AnimatedCounter's numeric-counting logic. BUSINESS_IMPACT_STATS is
 * deliberately empty until this deployment has real, verifiable impact
 * numbers to report (see src/lib/trust-content.ts's header comment) —
 * never fabricate example entries here. Populate the array there and this
 * component renders the populated grid with no changes needed here.
 */
function BusinessImpact() {
  const hasStats = BUSINESS_IMPACT_STATS.length > 0;

  return (
    <section className="relative py-24 sm:py-32">
      <Container className="flex flex-col items-center gap-14">
        <SectionHeading
          eyebrow="Business impact"
          title={
            <>
              The impact,{" "}
              <span className="text-gradient-brand">in one glance</span>
            </>
          }
          description="Headline outcomes clients see after adopting GrowthOS."
        />

        {hasStats ? (
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            className="grid w-full grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4"
          >
            {BUSINESS_IMPACT_STATS.map((stat) => (
              <motion.div key={stat.label} variants={fadeInUp}>
                <Card glass className="flex flex-col items-center gap-3 p-8 text-center">
                  <span className="text-gradient-brand text-5xl font-bold tracking-tight sm:text-6xl">
                    {stat.value}
                  </span>
                  <span className="text-balance text-sm font-medium text-foreground sm:text-base">
                    {stat.label}
                  </span>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        ) : (
          <Card glass className="w-full max-w-xl">
            <CardHeader>
              <div className="flex items-center gap-2">
                <CardTitle>Business impact</CardTitle>
                <Badge variant="accent">Coming soon</Badge>
              </div>
              <CardDescription>
                Headline impact numbers will appear here once real,
                verifiable client outcomes exist to report.
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

export default BusinessImpact;
export { BusinessImpact };
