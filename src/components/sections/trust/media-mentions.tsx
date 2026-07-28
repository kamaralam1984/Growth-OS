"use client";

import { motion } from "framer-motion";
import { Newspaper, Sparkles } from "lucide-react";

import { Container } from "@/components/ui/container";
import { SectionHeading } from "@/components/ui/section-heading";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fadeInUp, staggerContainer } from "@/animations";
import { MEDIA_MENTIONS, type MediaMention } from "@/lib/trust-content";

/**
 * Architecture-only for now — MEDIA_MENTIONS is empty until a real
 * magazine, news outlet, podcast, conference, interview, or blog actually
 * covers this platform (see src/lib/trust-content.ts's header comment).
 * Nothing here is a fabricated outlet name.
 *
 * Renders an honest "architecture ready" state below, matching the visual
 * language of src/app/profile/_components/coming-soon-card.tsx. The
 * populated-mode logo-strip render (in the spirit of
 * technology-partners.tsx's badge-wall) is fully implemented and ready the
 * moment real mentions are added to MEDIA_MENTIONS — no changes needed
 * here.
 */

function MediaMentionBadge({ mention }: { mention: MediaMention }) {
  if (mention.logoUrl) {
    return (
      <span className="flex h-14 items-center justify-center rounded-xl border border-border bg-card px-6 py-3 shadow-card">
        {/* eslint-disable-next-line @next/next/no-img-element -- external, arbitrary outlet-supplied logo URLs; not known at build time for next/image */}
        <img src={mention.logoUrl} alt={mention.outlet} className="max-h-8 w-auto object-contain" />
      </span>
    );
  }

  return (
    <Badge variant="outline" className="h-14 gap-2 px-6 py-3 text-sm">
      <Newspaper className="size-4" />
      <span>{mention.outlet}</span>
      <span className="text-muted-foreground">· {mention.type}</span>
    </Badge>
  );
}

function MediaMentions() {
  const hasMentions = MEDIA_MENTIONS.length > 0;

  return (
    <section className="relative py-24 sm:py-32">
      <Container className="flex flex-col items-center gap-14">
        <SectionHeading
          eyebrow="In the press"
          title="Media mentions"
          description="Coverage across magazines, news outlets, podcasts, conferences, interviews, and blogs."
        />

        {hasMentions ? (
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            className="flex flex-wrap items-center justify-center gap-3"
          >
            {MEDIA_MENTIONS.map((mention) => (
              <motion.div key={`${mention.outlet}-${mention.type}`} variants={fadeInUp}>
                <MediaMentionBadge mention={mention} />
              </motion.div>
            ))}
          </motion.div>
        ) : (
          <Card glass className="w-full max-w-2xl">
            <CardHeader>
              <div className="flex items-center gap-2">
                <CardTitle>Media mentions</CardTitle>
                <Badge variant="accent">Architecture ready</Badge>
              </div>
              <CardDescription>
                No press coverage to show yet. This logo strip is wired up and ready — real outlet
                mentions will appear here the moment coverage exists.
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

export default MediaMentions;
export { MediaMentions };
