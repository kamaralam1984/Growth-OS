"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Download, Trash2, Cookie } from "lucide-react";

import { Container } from "@/components/ui/container";
import { SectionHeading } from "@/components/ui/section-heading";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { fadeInUp, staggerContainer } from "@/animations";

/**
 * Static, honest copy grounded in what's actually implemented — deliberately
 * does not import anything from src/lib/security-content.ts. Every feature
 * described below is real and already shipped in the product:
 *   - Self-service data export (download your own data as JSON)
 *   - Destructive-action-protected account deletion/anonymization
 *     (requires typing a confirmation phrase + password re-check)
 *   - First-party cookie consent with analytics opt-in, off by default
 */

interface PrivacyFeature {
  icon: typeof Download;
  title: string;
  description: string;
}

const PRIVACY_FEATURES: PrivacyFeature[] = [
  {
    icon: Download,
    title: "Self-Service Data Export",
    description:
      "Download a complete export of your own data as JSON, on demand — no request ticket or waiting period required.",
  },
  {
    icon: Trash2,
    title: "Protected Account Deletion",
    description:
      "Deleting or anonymizing your account is a genuinely destructive-action-protected flow — you must type a confirmation phrase and re-enter your password before anything is removed.",
  },
  {
    icon: Cookie,
    title: "First-Party Cookie Consent",
    description:
      "Analytics cookies are opt-in and off by default. We only set them after you explicitly consent, and you can withdraw that consent at any time.",
  },
];

function DataPrivacyCenter() {
  return (
    <section className="relative py-24 sm:py-32">
      <Container className="flex flex-col items-center gap-14">
        <SectionHeading
          eyebrow="Data privacy"
          title="Your data, under your control"
          description="Real, working privacy controls built into the product — not just a policy document."
        />

        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          className="grid w-full grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3"
        >
          {PRIVACY_FEATURES.map((feature) => (
            <motion.div key={feature.title} variants={fadeInUp}>
              <Card glass className="flex h-full flex-col gap-3 p-6">
                <feature.icon className="size-5 shrink-0 text-primary" strokeWidth={2.5} />
                <span className="text-base font-semibold text-foreground">{feature.title}</span>
                <p className="text-sm text-muted-foreground">{feature.description}</p>
              </Card>
            </motion.div>
          ))}
        </motion.div>

        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          className="grid w-full grid-cols-1 gap-6 sm:grid-cols-2"
        >
          <motion.div variants={fadeInUp}>
            <Card glass className="flex h-full flex-col gap-4 p-6">
              <CardHeader className="gap-1.5 p-0">
                <CardTitle>Manage your data</CardTitle>
                <CardDescription>
                  Export or delete your data directly from your account settings.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Button asChild>
                  <Link href="/privacy">Manage your data</Link>
                </Button>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div variants={fadeInUp}>
            <Card glass className="flex h-full flex-col gap-4 p-6">
              <CardHeader className="gap-1.5 p-0">
                <CardTitle>Privacy requests</CardTitle>
                <CardDescription>
                  Have a question about how we handle your data? Reach our support team directly.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Button variant="outline" asChild>
                  <Link href="/contact?department=SUPPORT">Privacy Requests</Link>
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        </motion.div>
      </Container>
    </section>
  );
}

export default DataPrivacyCenter;
export { DataPrivacyCenter };
