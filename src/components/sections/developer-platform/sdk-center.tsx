"use client";

import { motion } from "framer-motion";
import { Package } from "lucide-react";

import { Container } from "@/components/ui/container";
import { SectionHeading } from "@/components/ui/section-heading";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fadeInUp, staggerContainer } from "@/animations";
import { SDK_ENTRIES } from "@/lib/developer-platform-content";

/** Real, working SDKs for JS/TS and Python — the rest honestly not built yet. */
function SdkCenter() {
  return (
    <section className="relative py-24 sm:py-32">
      <Container className="flex flex-col items-center gap-14">
        <SectionHeading
          eyebrow="SDKs"
          title="Real client libraries, honestly scoped"
          description="Two real, hand-written SDKs today — not yet published to a package registry, but genuinely functional. The rest are on our roadmap, not faked."
        />
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {SDK_ENTRIES.map((sdk) => (
            <motion.div key={sdk.language} variants={fadeInUp}>
              <Card glass className="flex h-full flex-col gap-3 p-5">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <Package className="size-4 text-primary" strokeWidth={2.5} />
                    {sdk.language}
                  </span>
                  <Badge variant={sdk.status === "Available" ? "accent" : "secondary"}>{sdk.status}</Badge>
                </div>
                {sdk.status === "Available" ? (
                  <>
                    <p className="text-xs text-muted-foreground">{sdk.description}</p>
                    <p className="text-xs text-muted-foreground/80">{sdk.install}</p>
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">Not built yet.</p>
                )}
              </Card>
            </motion.div>
          ))}
        </motion.div>
      </Container>
    </section>
  );
}

export default SdkCenter;
export { SdkCenter };
