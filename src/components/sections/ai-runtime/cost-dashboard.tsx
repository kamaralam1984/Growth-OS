"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { DollarSign } from "lucide-react";

import { Container } from "@/components/ui/container";
import { SectionHeading } from "@/components/ui/section-heading";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { fadeInUp, staggerContainer } from "@/animations";
import { COST_TRACKING_REALITY } from "@/lib/ai-runtime-content";

/**
 * Deliberately restrained: COST_TRACKING_REALITY describes real per-request
 * token/cost recording against an org's AI credit balance — not a public
 * cost-analytics preview. The CTA below links to a real, already-shipped
 * account page (/dashboard/billing/ai-credits) that requires the visitor to
 * be signed in; it's an honest "go manage this in your account" link, not a
 * public data preview embedded on this marketing page.
 */
function CostDashboard() {
  return (
    <section className="relative py-24 sm:py-32">
      <Container className="flex flex-col items-center gap-14">
        <SectionHeading
          eyebrow="Cost tracking"
          title="Real cost tracking, honestly described"
          description="No public cost preview here — your real usage lives in your account once you're signed in."
        />

        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          className="w-full max-w-3xl"
        >
          <motion.div variants={fadeInUp}>
            <Card glass className="flex flex-col gap-4 p-8 sm:p-10">
              <div className="flex items-start gap-3">
                <DollarSign className="size-5 shrink-0 text-primary" strokeWidth={2.5} />
                <h3 className="text-xl font-semibold text-foreground sm:text-2xl">
                  {COST_TRACKING_REALITY.title}
                </h3>
              </div>
              <p className="text-base text-foreground/90 sm:text-lg">
                {COST_TRACKING_REALITY.description}
              </p>
              <p className="text-sm text-muted-foreground">
                {COST_TRACKING_REALITY.detail}
              </p>
              <div>
                <Button asChild variant="outline" size="md">
                  <Link href="/dashboard/billing/ai-credits">View your usage</Link>
                </Button>
              </div>
            </Card>
          </motion.div>
        </motion.div>
      </Container>
    </section>
  );
}

export default CostDashboard;
export { CostDashboard };
