"use client";

import { motion } from "framer-motion";
import { Building2, Sparkles } from "lucide-react";

import { Container } from "@/components/ui/container";
import { SectionHeading } from "@/components/ui/section-heading";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fadeInUp, staggerContainer } from "@/animations";
import { INDUSTRY_EXPERIENCE } from "@/lib/trust-content";

/**
 * Industries-served grid. Every card uses the same neutral Building2 icon
 * since the real industries this platform has served aren't known ahead
 * of time — there's no honest way to pick a bespoke icon per industry
 * before real engagements exist. INDUSTRY_EXPERIENCE is deliberately empty
 * until this deployment has real industry engagements to report (see
 * src/lib/trust-content.ts's header comment) — never fabricate example
 * entries here. Populate the array there and this component renders the
 * populated grid with no changes needed here.
 */
function IndustryExperience() {
  const hasIndustries = INDUSTRY_EXPERIENCE.length > 0;

  return (
    <section className="relative py-24 sm:py-32">
      <Container className="flex flex-col items-center gap-14">
        <SectionHeading
          eyebrow="Industry experience"
          title={
            <>
              Experience across{" "}
              <span className="text-gradient-brand">real industries</span>
            </>
          }
          description="Sectors GrowthOS has been put to work in, and what was delivered."
        />

        {hasIndustries ? (
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            className="grid w-full grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3"
          >
            {INDUSTRY_EXPERIENCE.map((entry) => (
              <motion.div key={entry.industry} variants={fadeInUp} className="h-full">
                <Card glass className="flex h-full flex-col gap-4 p-6">
                  <div className="flex items-center gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Building2 className="size-5" strokeWidth={2} />
                    </span>
                    <span className="text-base font-semibold text-foreground">
                      {entry.industry}
                    </span>
                  </div>
                  <p className="flex-1 text-sm text-muted-foreground">
                    {entry.description}
                  </p>
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    {entry.projectsCount}{" "}
                    {entry.projectsCount === 1 ? "project" : "projects"} delivered
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {entry.solutions.map((solution) => (
                      <Badge key={solution} variant="outline">
                        {solution}
                      </Badge>
                    ))}
                  </div>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        ) : (
          <Card glass className="w-full max-w-xl">
            <CardHeader>
              <div className="flex items-center gap-2">
                <CardTitle>Industry experience</CardTitle>
                <Badge variant="accent">Coming soon</Badge>
              </div>
              <CardDescription>
                This section will populate with real industries and
                solutions as the platform is used across more sectors.
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

export default IndustryExperience;
export { IndustryExperience };
