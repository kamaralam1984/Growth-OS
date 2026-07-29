"use client";

import { motion } from "framer-motion";
import { Gauge } from "lucide-react";

import { Container } from "@/components/ui/container";
import { SectionHeading } from "@/components/ui/section-heading";
import { Card } from "@/components/ui/card";
import { fadeInUp, staggerContainer } from "@/animations";
import { RATE_LIMIT_FACTS } from "@/lib/developer-platform-content";

function RateLimitsQuotas() {
  return (
    <section className="relative py-24 sm:py-32">
      <Container className="flex flex-col items-center gap-14">
        <SectionHeading
          eyebrow="Rate limits"
          title="Real limits, not a live quota dashboard yet"
          description="Every API key is rate-limited by a real, Redis-backed sliding window — here's exactly how it works."
        />
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
        >
          {RATE_LIMIT_FACTS.map((fact) => (
            <motion.div key={fact.label} variants={fadeInUp}>
              <Card glass className="flex h-full flex-col gap-2 p-5">
                <Gauge className="size-4 text-primary" strokeWidth={2.5} />
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{fact.label}</p>
                <p className="text-sm font-medium text-foreground">{fact.value}</p>
              </Card>
            </motion.div>
          ))}
        </motion.div>
        <p className="max-w-2xl text-center text-sm text-muted-foreground">
          On a 429, back off and retry — the response body always tells you exactly what happened:{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{"{ \"error\": \"Rate limit exceeded.\" }"}</code>.
          A live, per-key quota-remaining view is on our roadmap, not built yet.
        </p>
      </Container>
    </section>
  );
}

export default RateLimitsQuotas;
export { RateLimitsQuotas };
