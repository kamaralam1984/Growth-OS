"use client";

import { motion } from "framer-motion";
import { Sparkles, Flag, Compass, Wrench, TrendingUp, Award, Quote } from "lucide-react";

import { Container } from "@/components/ui/container";
import { SectionHeading } from "@/components/ui/section-heading";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fadeInUp, staggerContainer } from "@/animations";
import { CLIENT_SUCCESS_STORIES, type ClientSuccessStory } from "@/lib/trust-content";

/**
 * Architecture-only for now — CLIENT_SUCCESS_STORIES is empty until real
 * engagements complete (see src/lib/trust-content.ts's header comment).
 * Renders an honest "coming soon" state below, matching the visual
 * language of src/app/profile/_components/coming-soon-card.tsx. The
 * populated-mode timeline render is fully implemented and ready to go the
 * moment real stories are added to that array — no changes needed here.
 */

const STAGES: {
  key: keyof Pick<ClientSuccessStory, "challenge" | "strategy" | "implementation" | "outcome" | "roi" | "feedback">;
  label: string;
  icon: typeof Flag;
}[] = [
  { key: "challenge", label: "The Challenge", icon: Flag },
  { key: "strategy", label: "Our Strategy", icon: Compass },
  { key: "implementation", label: "Implementation", icon: Wrench },
  { key: "outcome", label: "Business Outcome", icon: TrendingUp },
  { key: "roi", label: "ROI", icon: Award },
  { key: "feedback", label: "Client Feedback", icon: Quote },
];

function StoryTimeline({ story }: { story: ClientSuccessStory }) {
  return (
    <Card glass className="overflow-hidden">
      <CardHeader>
        <CardTitle>{story.clientName}</CardTitle>
      </CardHeader>
      <CardContent>
        <motion.ol
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          className="relative flex flex-col gap-8 border-l border-border pl-8"
        >
          {STAGES.map(({ key, label, icon: Icon }) => (
            <motion.li key={key} variants={fadeInUp} className="relative">
              <span className="absolute -left-[calc(2rem+1px)] top-0.5 flex size-6 items-center justify-center rounded-full border border-primary/30 bg-primary/10">
                <Icon className="size-3.5 text-primary" strokeWidth={2.25} />
              </span>
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">{label}</p>
              <p className="mt-1 text-sm leading-relaxed text-foreground">{story[key]}</p>
            </motion.li>
          ))}
        </motion.ol>
      </CardContent>
    </Card>
  );
}

function ClientSuccessStories() {
  const hasStories = CLIENT_SUCCESS_STORIES.length > 0;

  return (
    <section className="relative py-24 sm:py-32">
      <Container className="flex flex-col items-center gap-14">
        <SectionHeading
          eyebrow="Client success stories"
          title="From first conversation to measurable outcome"
          description="Every engagement is a narrative — the challenge we were brought in for, the strategy we proposed, and the result it produced."
        />

        {hasStories ? (
          <div className="flex w-full flex-col gap-8">
            {CLIENT_SUCCESS_STORIES.map((story) => (
              <StoryTimeline key={story.clientName} story={story} />
            ))}
          </div>
        ) : (
          <Card glass className="w-full max-w-2xl">
            <CardHeader>
              <div className="flex items-center gap-2">
                <CardTitle>Client success stories</CardTitle>
                <Badge variant="accent">Coming soon</Badge>
              </div>
              <CardDescription>
                Client success stories will appear here as engagements complete.
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

export default ClientSuccessStories;
export { ClientSuccessStories };
