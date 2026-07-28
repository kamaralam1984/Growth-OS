"use client";

import { Sparkles } from "lucide-react";
import { motion } from "framer-motion";

import { Container } from "@/components/ui/container";
import { SectionHeading } from "@/components/ui/section-heading";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fadeInUp, staggerContainer } from "@/animations";
import { FEATURED_CLIENTS } from "@/lib/trust-content";

/**
 * Premium featured-client spotlight cards. FEATURED_CLIENTS is deliberately
 * empty until a real client has agreed to be showcased with real project
 * detail — see src/lib/trust-content.ts's header comment. Renders an
 * honest "coming soon" card instead of silently disappearing, so this
 * section's presence in the architecture is visible during manual QA /
 * integration tests. Populate FEATURED_CLIENTS (and only that array) once
 * real client data exists; this component needs no changes to start
 * rendering the grid below.
 */
function FeaturedClients() {
  if (FEATURED_CLIENTS.length === 0) {
    return (
      <section className="relative py-24 sm:py-32">
        <Container className="flex flex-col items-center gap-14">
          <SectionHeading
            eyebrow="Featured clients"
            title="Client spotlights"
            description="In-depth spotlights on real client engagements will appear here once real project data exists."
          />

          <Card glass className="w-full max-w-xl">
            <CardHeader>
              <div className="flex items-center gap-2">
                <CardTitle>Featured client spotlights</CardTitle>
                <Badge variant="accent">Coming soon</Badge>
              </div>
              <CardDescription>No client spotlights are ready to publish yet.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border py-12 text-center">
                <Sparkles className="size-6 text-muted-foreground" />
                <p className="max-w-sm text-sm text-muted-foreground">
                  This isn&apos;t built yet — check back once real client project detail is added.
                </p>
              </div>
            </CardContent>
          </Card>
        </Container>
      </section>
    );
  }

  return (
    <section className="relative py-24 sm:py-32">
      <Container className="flex flex-col items-center gap-14">
        <SectionHeading
          eyebrow="Featured clients"
          title="Client spotlights"
          description="A closer look at how real teams have used GrowthOS to solve real problems."
        />

        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          className="grid w-full grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3"
        >
          {FEATURED_CLIENTS.map((client) => (
            <motion.div key={client.companyName} variants={fadeInUp}>
              <Card glass className="flex h-full flex-col gap-4 p-6">
                <div className="flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element -- client-provided logo asset from an arbitrary URL, not a static/optimizable local image */}
                  <img
                    src={client.logoUrl}
                    alt={client.companyName}
                    className="size-10 shrink-0 rounded-lg object-contain"
                  />
                  <div className="flex flex-col">
                    <CardTitle className="text-base">{client.companyName}</CardTitle>
                    <CardDescription>
                      {client.industry} · {client.country}
                    </CardDescription>
                  </div>
                </div>

                <p className="text-sm font-medium text-muted-foreground">{client.projectType}</p>

                <div className="flex flex-wrap gap-1.5">
                  {client.servicesDelivered.map((service) => (
                    <Badge key={`service-${service}`} variant="secondary">
                      {service}
                    </Badge>
                  ))}
                  {client.technology.map((tech) => (
                    <Badge key={`tech-${tech}`} variant="outline">
                      {tech}
                    </Badge>
                  ))}
                </div>

                <div className="mt-auto rounded-xl border border-primary/20 bg-primary/5 p-3">
                  <p className="text-sm font-semibold text-primary">{client.result}</p>
                </div>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      </Container>
    </section>
  );
}

export default FeaturedClients;
export { FeaturedClients };
