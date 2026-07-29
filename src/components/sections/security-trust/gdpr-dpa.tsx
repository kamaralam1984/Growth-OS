"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { FileText } from "lucide-react";

import { Container } from "@/components/ui/container";
import { SectionHeading } from "@/components/ui/section-heading";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fadeInUp, staggerContainer } from "@/animations";
import { DPA_STATUS } from "@/lib/security-content";

function GdprDpa() {
  return (
    <section className="relative py-24 sm:py-32">
      <Container className="flex flex-col items-center gap-14">
        <SectionHeading
          eyebrow="GDPR & DPA"
          title="GDPR-aligned data rights, for real"
          description="Consent, export, and deletion are backed by working code — not just a policy statement."
        />

        <motion.div
          variants={fadeInUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          className="max-w-3xl text-center text-sm text-muted-foreground sm:text-base"
        >
          We record real, timestamped consent for the cookies and processing you agree to, and we
          back the rights the GDPR grants you with working features: a genuine self-service data
          export and an account deletion/anonymization flow that requires typing a confirmation
          phrase and re-entering your password before anything is removed.
        </motion.div>

        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          className="grid w-full grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3"
        >
          <motion.div variants={fadeInUp}>
            <Card glass className="flex h-full flex-col gap-4 p-6">
              <CardHeader className="gap-1.5 p-0">
                <CardTitle>Export my data</CardTitle>
                <CardDescription>
                  {/*
                    These actions live in your account, not on this public
                    marketing page — you must be logged in to use them, so
                    the CTA points to your account rather than performing
                    the action here.
                  */}
                  Download a full copy of your data as JSON from your account.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Button variant="outline" asChild>
                  <Link href="/profile">Manage in your account</Link>
                </Button>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div variants={fadeInUp}>
            <Card glass className="flex h-full flex-col gap-4 p-6">
              <CardHeader className="gap-1.5 p-0">
                <CardTitle>Delete my data</CardTitle>
                <CardDescription>
                  Delete or anonymize your account, protected by a confirmation phrase and password
                  re-check.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Button variant="outline" asChild>
                  <Link href="/profile">Manage in your account</Link>
                </Button>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div variants={fadeInUp}>
            <Card glass className="flex h-full flex-col gap-3 p-6">
              <FileText className="size-5 shrink-0 text-primary" strokeWidth={2.5} />
              <div className="flex items-center gap-2">
                <span className="text-base font-semibold text-foreground">{DPA_STATUS.name}</span>
              </div>
              <Badge variant="outline" className="w-fit">
                {DPA_STATUS.status}
              </Badge>
            </Card>
          </motion.div>
        </motion.div>

        <motion.div variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-80px" }}>
          <Card glass className="flex flex-col items-center gap-4 p-6 text-center">
            <CardHeader className="gap-1.5 p-0">
              <CardTitle>Documentation request</CardTitle>
              <CardDescription>
                Need a copy of our Data Processing Agreement or other GDPR documentation? Reach out
                and we&apos;ll send it over.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Button asChild>
                <Link href="/contact?department=SUPPORT">Documentation Request</Link>
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      </Container>
    </section>
  );
}

export default GdprDpa;
export { GdprDpa };
