"use client";

import * as React from "react";
import Image from "next/image";
import { motion } from "framer-motion";

import { fadeInUp } from "@/animations";
import { Container } from "@/components/ui/container";

/**
 * A single designed graphic (public/images/ai-workforce-team.png) replaces
 * the previous card-grid layout — the headline, eyebrow, description, and
 * per-agent labels are all baked into the image itself, not rendered as
 * separate DOM text. alt carries the full equivalent content for screen
 * readers/SEO per WCAG 1.1.1, since none of that text exists elsewhere on
 * the page.
 */
const IMAGE_ALT =
  "Meet your AI workforce: five specialized agents working as one team. CEO AI handles strategy and prioritization; Sales AI handles lead qualification; Marketing AI handles content and campaigns; Proposal AI drafts proposals and quotes; Outreach AI runs cold email and LinkedIn sequences. One goal: maximum growth.";

function AIAgents() {
  return (
    <section className="relative py-24 sm:py-32">
      <Container className="flex flex-col items-center">
        <motion.div
          variants={fadeInUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          className="w-full overflow-hidden rounded-2xl border border-border shadow-elevated"
        >
          <Image
            src="/images/ai-workforce-team.png"
            alt={IMAGE_ALT}
            width={1536}
            height={1024}
            sizes="(min-width: 1024px) 1024px, 100vw"
            className="h-auto w-full"
            priority={false}
          />
        </motion.div>
      </Container>
    </section>
  );
}

export default AIAgents;
export { AIAgents };
