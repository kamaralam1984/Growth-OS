"use client";

import { motion } from "framer-motion";
import { Quote } from "lucide-react";

import { Container } from "@/components/ui/container";
import { SectionHeading } from "@/components/ui/section-heading";
import { Card, CardContent } from "@/components/ui/card";
import { fadeInUp, staggerContainer } from "@/animations";

const ROLE_LABELS = [
  "VP of Growth, B2B SaaS",
  "Head of RevOps, Fintech",
  "Founder, Growth Agency",
  "Director of Demand Gen, Cloud Infrastructure",
  "Head of Sales Development, Vertical SaaS",
] as const;

const TESTIMONIALS = [
  {
    quote:
      "We stopped losing deals to slow follow-up. GrowthOS's agents respond to inbound interest in minutes, not days, and our reps only get pulled in once a lead is actually qualified.",
    role: "VP of Growth, B2B SaaS",
  },
  {
    quote:
      "The growth intelligence view replaced four separate spreadsheets our RevOps team was stitching together every Monday. Now channel ROI and pipeline velocity live in one place, updated in real time.",
    role: "Head of RevOps, Fintech",
  },
  {
    quote:
      "Running outreach for multiple client accounts used to mean multiple tools and a lot of manual sequencing. GrowthOS lets us stand up a full acquisition workflow for a new client in an afternoon.",
    role: "Founder, Growth Agency",
  },
] as const;

function SocialProof() {
  return (
    <section className="relative py-24 sm:py-32">
      <Container className="flex flex-col items-center gap-14">
        <SectionHeading
          eyebrow="Trusted by growth teams"
          title={
            <>
              Built for the teams{" "}
              <span className="text-gradient-brand">closest to pipeline</span>
            </>
          }
          description="From founder-led agencies to enterprise RevOps functions, growth leaders run their acquisition motion on GrowthOS."
        />

        <motion.div
          className="flex w-full flex-wrap items-center justify-center gap-3"
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
        >
          {ROLE_LABELS.map((role) => (
            <motion.span
              key={role}
              variants={fadeInUp}
              className="inline-flex items-center rounded-full border border-border bg-muted px-4 py-2 text-xs font-medium text-muted-foreground sm:text-sm"
            >
              {role}
            </motion.span>
          ))}
        </motion.div>

        <motion.div
          className="grid w-full grid-cols-1 gap-6 md:grid-cols-3"
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
        >
          {TESTIMONIALS.map((testimonial) => (
            <motion.div key={testimonial.role} variants={fadeInUp} className="h-full">
              <Card glass className="flex h-full flex-col">
                <CardContent className="flex h-full flex-col gap-5 pt-6">
                  <Quote
                    className="size-6 shrink-0 text-primary"
                    strokeWidth={1.75}
                  />
                  <p className="flex-1 text-balance text-sm leading-relaxed text-foreground">
                    &ldquo;{testimonial.quote}&rdquo;
                  </p>
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    {testimonial.role}
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      </Container>
    </section>
  );
}

export default SocialProof;
export { SocialProof };
