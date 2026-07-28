"use client";

import { motion } from "framer-motion";

import { Container } from "@/components/ui/container";
import { SectionHeading } from "@/components/ui/section-heading";
import { Badge } from "@/components/ui/badge";
import { fadeInUp, staggerContainer } from "@/animations";
import { TECHNOLOGY_PARTNERS } from "@/lib/trust-content";

/**
 * Every entry is a real, currently-supported integration or infra
 * component — sourced from src/lib/trust-content.ts, which is itself
 * sourced 1:1 from src/lib/integrations/registry.ts, src/lib/ai/providers/,
 * and src/lib/billing/gateway/. Nothing here is aspirational.
 */
function TechnologyPartners() {
  if (TECHNOLOGY_PARTNERS.length === 0) {
    return null;
  }

  return (
    <section className="relative py-24 sm:py-32">
      <Container className="flex flex-col items-center gap-14">
        <SectionHeading
          eyebrow="Technology"
          title="Built on a real integration ecosystem"
          description="GrowthOS connects to the tools your team already runs — every one of these is a genuinely supported integration, not a wishlist."
        />

        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          className="flex flex-wrap justify-center gap-3"
        >
          {TECHNOLOGY_PARTNERS.map((partner) => (
            <motion.div key={partner.name} variants={fadeInUp}>
              <Badge variant="outline" className="px-4 py-2 text-sm">
                {partner.name}
              </Badge>
            </motion.div>
          ))}
        </motion.div>
      </Container>
    </section>
  );
}

export default TechnologyPartners;
export { TechnologyPartners };
