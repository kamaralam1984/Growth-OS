"use client";

import { motion } from "framer-motion";
import { Sparkles, Star } from "lucide-react";

import { Container } from "@/components/ui/container";
import { SectionHeading } from "@/components/ui/section-heading";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fadeInUp, staggerContainer } from "@/animations";
import { TESTIMONIALS, type Testimonial } from "@/lib/trust-content";

/**
 * Architecture-only for now — TESTIMONIALS is empty until real, named
 * client testimonials exist (see src/lib/trust-content.ts's header
 * comment). Renders an honest "coming soon" state below, matching the
 * visual language of src/app/profile/_components/coming-soon-card.tsx.
 * The populated-mode grid render is fully implemented and ready to go the
 * moment real testimonials are added to that array — no changes needed
 * here.
 *
 * Distinct from src/components/sections/social-proof.tsx, which uses
 * generic role-label placeholders (e.g. "VP of Growth, B2B SaaS") rather
 * than real named clients — that file is untouched by this component.
 */

const TOTAL_STARS = 5;

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5" aria-label={`${rating} out of ${TOTAL_STARS} stars`}>
      {Array.from({ length: TOTAL_STARS }, (_, i) => (
        <Star
          key={i}
          className={
            i < rating
              ? "size-4 fill-primary text-primary"
              : "size-4 text-muted-foreground/30"
          }
          strokeWidth={1.75}
        />
      ))}
    </div>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function TestimonialCard({ testimonial }: { testimonial: Testimonial }) {
  return (
    <Card glass className="flex h-full flex-col">
      <CardContent className="flex h-full flex-col gap-5 pt-6">
        <StarRating rating={testimonial.rating} />
        <p className="flex-1 text-balance text-sm leading-relaxed text-foreground">
          &ldquo;{testimonial.quote}&rdquo;
        </p>
        <div className="flex items-center gap-3 border-t border-border pt-4">
          {testimonial.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- real client photos are arbitrary uploaded/external URLs, matching the plain-<img> convention used across this codebase (e.g. src/components/upload/image-upload-field.tsx) rather than next/image, which would require remotePatterns for an unknown future host.
            <img
              src={testimonial.photoUrl}
              alt=""
              className="size-11 shrink-0 rounded-full object-cover"
            />
          ) : (
            <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
              {initials(testimonial.name)}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">{testimonial.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {testimonial.designation}, {testimonial.company}
            </p>
          </div>
          <span className="shrink-0 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {testimonial.country}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function Testimonials() {
  const hasTestimonials = TESTIMONIALS.length > 0;

  return (
    <section className="relative py-24 sm:py-32">
      <Container className="flex flex-col items-center gap-14">
        <SectionHeading
          eyebrow="Testimonials"
          title="What clients say, in their own words"
          description="Real feedback from the people we've worked with, rated and attributed by name."
        />

        {hasTestimonials ? (
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            className="grid w-full grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3"
          >
            {TESTIMONIALS.map((testimonial) => (
              <motion.div key={`${testimonial.name}-${testimonial.company}`} variants={fadeInUp} className="h-full">
                <TestimonialCard testimonial={testimonial} />
              </motion.div>
            ))}
          </motion.div>
        ) : (
          <Card glass className="w-full max-w-2xl">
            <CardHeader>
              <div className="flex items-center gap-2">
                <CardTitle>Testimonials</CardTitle>
                <Badge variant="accent">Coming soon</Badge>
              </div>
              <CardDescription>
                Real, named client testimonials will appear here once they&apos;re collected.
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

export default Testimonials;
export { Testimonials };
