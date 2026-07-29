"use client";

import { motion } from "framer-motion";
import { Globe } from "lucide-react";

import { Container } from "@/components/ui/container";
import { SectionHeading } from "@/components/ui/section-heading";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fadeInUp } from "@/animations";
import { DATA_RESIDENCY_STATEMENT } from "@/lib/security-content";

/**
 * Deliberately a single honest statement card, not an interactive map —
 * no real geographic/provider data exists to plot, and no region or
 * hosting-provider name is disclosed here, per a deliberate business
 * decision. See src/lib/security-content.ts's header comment.
 */
function DataResidency() {
  return (
    <section className="relative py-24 sm:py-32">
      <Container className="flex flex-col items-center gap-14">
        <SectionHeading
          eyebrow="Data residency"
          title="Where your data lives"
          description="A straightforward, honest statement about our current hosting footprint."
        />

        <motion.div
          variants={fadeInUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          className="w-full max-w-2xl"
        >
          <Card glass className="flex flex-col gap-4 p-8 text-center items-center">
            <Globe className="size-6 shrink-0 text-primary" strokeWidth={2.5} />
            <CardHeader className="gap-1.5 p-0">
              <CardTitle className="text-xl">{DATA_RESIDENCY_STATEMENT.current}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <CardDescription className="text-sm sm:text-base">
                {DATA_RESIDENCY_STATEMENT.detail}
              </CardDescription>
            </CardContent>
          </Card>
        </motion.div>
      </Container>
    </section>
  );
}

export default DataResidency;
export { DataResidency };
