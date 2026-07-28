"use client";

import { Sparkles } from "lucide-react";
import { motion } from "framer-motion";

import { Container } from "@/components/ui/container";
import { SectionHeading } from "@/components/ui/section-heading";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fadeInUp, staggerContainer } from "@/animations";
import { TRUSTED_BY_LOGOS } from "@/lib/trust-content";

/**
 * "Trusted By" logo wall. TRUSTED_BY_LOGOS is deliberately empty until a
 * real client has actually agreed to have their logo shown here — see
 * src/lib/trust-content.ts's header comment. Renders an honest "coming
 * soon" card instead of silently disappearing, so this section's presence
 * in the architecture is visible during manual QA / integration tests, not
 * indistinguishable from "was never built". Populate TRUSTED_BY_LOGOS (and
 * only that array) once real, permissioned client logos exist; this
 * component needs no changes to start rendering the wall below.
 */
function TrustedBy() {
  if (TRUSTED_BY_LOGOS.length === 0) {
    return (
      <section className="relative py-24 sm:py-32">
        <Container className="flex flex-col items-center gap-14">
          <SectionHeading
            eyebrow="Trusted by"
            title="Companies who trust GrowthOS"
            description="A wall of real client logos will appear here once clients have agreed to be featured."
          />

          <Card glass className="w-full max-w-xl">
            <CardHeader>
              <div className="flex items-center gap-2">
                <CardTitle>Client logo wall</CardTitle>
                <Badge variant="accent">Coming soon</Badge>
              </div>
              <CardDescription>No client logos are approved for display yet.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border py-12 text-center">
                <Sparkles className="size-6 text-muted-foreground" />
                <p className="max-w-sm text-sm text-muted-foreground">
                  This isn&apos;t built yet — check back once real client logos are added.
                </p>
              </div>
            </CardContent>
          </Card>
        </Container>
      </section>
    );
  }

  return (
    <section className="relative py-24 sm:py-32">
      <Container className="flex flex-col items-center gap-14">
        <SectionHeading
          eyebrow="Trusted by"
          title="Companies who trust GrowthOS"
          description="A growing list of teams who run their growth operations on GrowthOS."
        />

        {/* Responsive wrap layout — gracefully holds 50+ logos without
            overflow, unlike a fixed-width marquee track. */}
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          className="flex w-full flex-wrap items-center justify-center gap-4"
        >
          {TRUSTED_BY_LOGOS.map((logo) => (
            <motion.div key={logo.name} variants={fadeInUp}>
              <Card
                glass
                className="flex h-16 w-40 items-center justify-center p-4 transition-colors duration-300 hover:border-primary/30"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- client-provided logo asset from an arbitrary URL, not a static/optimizable local image */}
                <img
                  src={logo.logoUrl}
                  alt={logo.name}
                  className="max-h-8 w-auto object-contain grayscale transition-[filter] duration-300 hover:grayscale-0"
                />
              </Card>
            </motion.div>
          ))}
        </motion.div>
      </Container>
    </section>
  );
}

export default TrustedBy;
export { TrustedBy };
