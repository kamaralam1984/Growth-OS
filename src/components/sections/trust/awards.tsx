"use client";

import { motion } from "framer-motion";
import { Sparkles, Trophy } from "lucide-react";

import { Container } from "@/components/ui/container";
import { SectionHeading } from "@/components/ui/section-heading";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fadeInUp, staggerContainer } from "@/animations";
import { AWARDS, type Award } from "@/lib/trust-content";

/**
 * Architecture-only for now — AWARDS is empty until a real award or
 * industry recognition exists (see src/lib/trust-content.ts's header
 * comment). Nothing here is a fabricated award name or organization.
 *
 * Renders an elegant "Future Recognition" placeholder below, matching the
 * visual language of src/app/profile/_components/coming-soon-card.tsx. The
 * populated-mode vertical timeline render (year-ordered, in the spirit of
 * client-success-stories.tsx's sequential-reveal pattern) is fully
 * implemented and ready the moment real awards are added to AWARDS — no
 * changes needed here.
 */

function AwardsTimeline({ awards }: { awards: Award[] }) {
  const sorted = [...awards].sort((a, b) => a.year - b.year);

  return (
    <motion.ol
      variants={staggerContainer}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-80px" }}
      className="relative flex w-full flex-col gap-8 border-l border-border pl-8"
    >
      {sorted.map((award) => (
        <motion.li key={`${award.title}-${award.year}`} variants={fadeInUp} className="relative">
          <span className="absolute -left-[calc(2rem+1px)] top-0.5 flex size-6 items-center justify-center rounded-full border border-primary/30 bg-primary/10">
            <Trophy className="size-3.5 text-primary" strokeWidth={2.25} />
          </span>
          <Card glass className="p-5">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle>{award.title}</CardTitle>
              <Badge variant="outline">{award.year}</Badge>
            </div>
            <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-primary">
              {award.organization}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{award.achievement}</p>
          </Card>
        </motion.li>
      ))}
    </motion.ol>
  );
}

function Awards() {
  const hasAwards = AWARDS.length > 0;

  return (
    <section className="relative py-24 sm:py-32">
      <Container className="flex flex-col items-center gap-14">
        <SectionHeading
          eyebrow="Awards & recognition"
          title="Recognition, earned over time"
          description="A year-ordered record of industry awards and recognition as they're earned."
        />

        {hasAwards ? (
          <AwardsTimeline awards={AWARDS} />
        ) : (
          <Card glass className="w-full max-w-2xl">
            <CardHeader>
              <div className="flex items-center gap-2">
                <CardTitle>Future Recognition</CardTitle>
                <Badge variant="accent">Coming soon</Badge>
              </div>
              <CardDescription>
                No awards or industry recognition to report yet — this timeline will fill in as real
                recognition is earned.
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

export default Awards;
export { Awards };
