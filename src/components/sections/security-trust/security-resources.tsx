"use client";

import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";

import { Container } from "@/components/ui/container";
import { SectionHeading } from "@/components/ui/section-heading";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fadeInUp, staggerContainer } from "@/animations";
import { COMING_SOON_RESOURCES } from "@/lib/security-content";

/**
 * Combined, honest "Coming Soon" section for the three security resources
 * that are genuinely not real yet — sourced 1:1 from
 * src/lib/security-content.ts's COMING_SOON_RESOURCES export. Mirrors the
 * dashed-border/muted-icon/"Coming soon" badge visual language of
 * src/app/profile/_components/coming-soon-card.tsx.
 */
function SecurityResources() {
  if (COMING_SOON_RESOURCES.length === 0) {
    return null;
  }

  return (
    <section className="relative py-24 sm:py-32">
      <Container className="flex flex-col items-center gap-14">
        <SectionHeading
          eyebrow="Coming soon"
          title="Resources we're still preparing"
          description="These aren't ready yet — we'd rather tell you honestly than fake it."
        />

        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          className="grid w-full grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3"
        >
          {COMING_SOON_RESOURCES.map((resource) => (
            <motion.div key={resource.title} variants={fadeInUp} className="h-full">
              <Card glass className="flex h-full flex-col">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <CardTitle>{resource.title}</CardTitle>
                    <Badge variant="accent">Coming soon</Badge>
                  </div>
                  <CardDescription>{resource.description}</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col">
                  <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border py-12 text-center">
                    <Sparkles className="size-6 text-muted-foreground" />
                    <p className="max-w-sm text-sm text-muted-foreground">
                      This isn&apos;t built yet — check back in a future release.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      </Container>
    </section>
  );
}

export default SecurityResources;
export { SecurityResources };
