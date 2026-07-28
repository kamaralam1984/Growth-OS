"use client";

import { motion } from "framer-motion";
import { BadgeCheck, Clock, ShieldCheck, Sparkles } from "lucide-react";

import { Container } from "@/components/ui/container";
import { SectionHeading } from "@/components/ui/section-heading";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { fadeInUp, staggerContainer } from "@/animations";
import { CERTIFICATIONS, type Certification } from "@/lib/trust-content";

/**
 * Architecture-only for now — CERTIFICATIONS is empty until a real
 * third-party audit or partnership exists (see src/lib/trust-content.ts's
 * header comment). This section is specifically for *third-party audited*
 * certifications and partnerships — things like an ISO 27001 certification,
 * a SOC 2 report, GDPR compliance certification, PCI DSS attestation, or a
 * cloud-provider (AWS/Azure/GCP) partner badge. None of those exist for
 * this deployment yet, so nothing is hardcoded here. This is distinct from
 * the platform's own verified, built-in security features, which already
 * ship in src/components/sections/trust/security-badges.tsx — that section
 * stays populated regardless of this one.
 *
 * Renders an honest "coming soon" state below, matching the visual
 * language of src/app/profile/_components/coming-soon-card.tsx. The
 * populated-mode wall render is fully implemented and ready the moment
 * real certifications are added to CERTIFICATIONS — no changes needed here.
 */

const STATUS_META: Record<Certification["status"], { icon: typeof ShieldCheck; badgeVariant: BadgeProps["variant"] }> = {
  Certified: { icon: ShieldCheck, badgeVariant: "accent" },
  Ready: { icon: BadgeCheck, badgeVariant: "outline" },
  "In Progress": { icon: Clock, badgeVariant: "secondary" },
};

function CertificationCard({ certification }: { certification: Certification }) {
  const { icon: Icon, badgeVariant } = STATUS_META[certification.status];

  return (
    <Card glass className="flex flex-col gap-3 p-5">
      <div className="flex items-center gap-2.5">
        <Icon className="size-4 shrink-0 text-primary" strokeWidth={2.5} />
        <span className="text-sm font-semibold text-foreground">{certification.name}</span>
      </div>
      <Badge variant={badgeVariant} className="w-fit">
        {certification.status}
      </Badge>
    </Card>
  );
}

function Certifications() {
  const hasCertifications = CERTIFICATIONS.length > 0;

  return (
    <section className="relative py-24 sm:py-32">
      <Container className="flex flex-col items-center gap-14">
        <SectionHeading
          eyebrow="Certifications"
          title="Third-party audited certifications"
          description="Independent audits and partnerships, tracked separately from our own built-in security controls."
        />

        {hasCertifications ? (
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
          >
            {CERTIFICATIONS.map((certification) => (
              <motion.div key={certification.name} variants={fadeInUp}>
                <CertificationCard certification={certification} />
              </motion.div>
            ))}
          </motion.div>
        ) : (
          <Card glass className="w-full max-w-2xl">
            <CardHeader>
              <div className="flex items-center gap-2">
                <CardTitle>Third-party certifications</CardTitle>
                <Badge variant="accent">Coming soon</Badge>
              </div>
              <CardDescription>
                We don&apos;t hold any third-party audited certifications or cloud-provider partnerships yet.
                This is separate from our own security features — see the Security &amp; Compliance section
                for the controls already built into the platform.
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

export default Certifications;
export { Certifications };
