"use client";

import { motion } from "framer-motion";
import { Briefcase, Globe, Sparkles, Users } from "lucide-react";

import { Container } from "@/components/ui/container";
import { SectionHeading } from "@/components/ui/section-heading";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fadeInUp, staggerContainer } from "@/animations";
import { GLOBAL_PRESENCE_MARKERS, type GlobalPresenceMarker } from "@/lib/trust-content";

/**
 * Architecture-only for now — GLOBAL_PRESENCE_MARKERS is empty until this
 * platform has real clients/projects in identifiable countries (see
 * src/lib/trust-content.ts's header comment). Nothing here is a fabricated
 * country or office location.
 *
 * No chart/map library (recharts, d3, react-simple-maps) is installed, and
 * while react-leaflet *is* installed, it's used elsewhere for a real
 * tile-map feature (the dashboard company map) — pulling in a heavy real
 * tile map here would be overkill for a marketing page with no real
 * geographic data to plot yet. So the populated-mode render below is a
 * simple, elegant responsive grid of country cards instead of an
 * interactive map. If real geographic presence data eventually justifies
 * it, this could be swapped for an actual react-leaflet map without
 * touching GLOBAL_PRESENCE_MARKERS's shape.
 *
 * Renders an honest "coming soon" state below, matching the visual
 * language of src/app/profile/_components/coming-soon-card.tsx.
 */

function PresenceCard({ marker }: { marker: GlobalPresenceMarker }) {
  return (
    <Card glass className="flex flex-col gap-4 p-5">
      <div className="flex items-center gap-2.5">
        <Globe className="size-4 shrink-0 text-primary" strokeWidth={2.5} />
        <span className="text-sm font-semibold text-foreground">{marker.country}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        <Badge variant="outline" className="gap-1.5">
          <Users className="size-3" />
          {marker.clients} {marker.clients === 1 ? "client" : "clients"}
        </Badge>
        <Badge variant="outline" className="gap-1.5">
          <Briefcase className="size-3" />
          {marker.projects} {marker.projects === 1 ? "project" : "projects"}
        </Badge>
      </div>
    </Card>
  );
}

function GlobalPresence() {
  const hasPresence = GLOBAL_PRESENCE_MARKERS.length > 0;

  return (
    <section className="relative py-24 sm:py-32">
      <Container className="flex flex-col items-center gap-14">
        <SectionHeading
          eyebrow="Global presence"
          title="Where we work"
          description="Clients and projects by country, as our geographic footprint grows."
        />

        {hasPresence ? (
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
          >
            {GLOBAL_PRESENCE_MARKERS.map((marker) => (
              <motion.div key={marker.country} variants={fadeInUp}>
                <PresenceCard marker={marker} />
              </motion.div>
            ))}
          </motion.div>
        ) : (
          <Card glass className="w-full max-w-2xl">
            <CardHeader>
              <div className="flex items-center gap-2">
                <CardTitle>Global presence</CardTitle>
                <Badge variant="accent">Coming soon</Badge>
              </div>
              <CardDescription>
                We don&apos;t have real country-by-country client and project data to show yet. This
                will fill in with genuine figures as the platform expands geographically.
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

export default GlobalPresence;
export { GlobalPresence };
