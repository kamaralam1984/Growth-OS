"use client";

import Link from "next/link";
import { motion } from "framer-motion";

import { Container } from "@/components/ui/container";
import { SectionHeading } from "@/components/ui/section-heading";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fadeInUp, staggerContainer } from "@/animations";
import { DEVELOPER_API_ITEMS } from "@/lib/ai-runtime-content";

/**
 * Sourced 1:1 from src/lib/ai-runtime-content.ts's DEVELOPER_API_ITEMS
 * export. Deliberately omits any SDK, API playground, or OpenAPI spec
 * claim beyond "Coming Soon" — none of those exist yet. "API Keys" links
 * to the real settings page it names, which requires login to reach.
 */
function DeveloperApis() {
  if (DEVELOPER_API_ITEMS.length === 0) {
    return null;
  }

  return (
    <section className="relative py-24 sm:py-32">
      <Container className="flex flex-col items-center gap-14">
        <SectionHeading
          eyebrow="Developer APIs"
          title="Build on top of the platform"
          description="Some developer surfaces are live today; others are on the roadmap and honestly labeled as such."
        />

        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2"
        >
          {DEVELOPER_API_ITEMS.map((item) => (
            <motion.div key={item.name} variants={fadeInUp}>
              <Card glass className="flex h-full flex-col gap-3 p-6">
                <span className="flex items-center justify-between gap-3">
                  <span className="text-base font-semibold text-foreground">{item.name}</span>
                  {item.status === "Available" ? (
                    <Badge variant="accent">Available</Badge>
                  ) : (
                    <Badge variant="outline">Coming Soon</Badge>
                  )}
                </span>
                <p className="flex-1 text-sm text-muted-foreground">{item.description}</p>
                {item.status === "Available" && item.name === "API Keys" ? (
                  // Requires an authenticated session — links straight into
                  // the dashboard rather than a public page.
                  <Link
                    href="/dashboard/settings/api-manager"
                    className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                  >
                    Manage API keys →
                  </Link>
                ) : null}
              </Card>
            </motion.div>
          ))}
        </motion.div>
      </Container>
    </section>
  );
}

export default DeveloperApis;
export { DeveloperApis };
