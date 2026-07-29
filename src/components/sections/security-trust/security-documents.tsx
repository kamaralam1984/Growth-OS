"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { FileText, Download } from "lucide-react";

import { Container } from "@/components/ui/container";
import { SectionHeading } from "@/components/ui/section-heading";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fadeInUp, staggerContainer } from "@/animations";
import { SECURITY_DOCUMENTS } from "@/lib/security-content";

/**
 * Document list sourced 1:1 from src/lib/security-content.ts's
 * SECURITY_DOCUMENTS export. "Available" documents link to their real,
 * already-shipped page; "Available on Request" documents are listed
 * honestly with no link — only a way to contact us about them.
 */
function SecurityDocuments() {
  if (SECURITY_DOCUMENTS.length === 0) {
    return null;
  }

  return (
    <section className="relative py-24 sm:py-32">
      <Container className="flex flex-col items-center gap-14">
        <SectionHeading
          eyebrow="Documentation"
          title="Enterprise security documents"
          description="Some documents are available to download right now; others are available on request while we finish preparing them."
        />

        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2"
        >
          {SECURITY_DOCUMENTS.map((doc) => (
            <motion.div key={doc.name} variants={fadeInUp}>
              <Card glass className="flex h-full flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                <span className="flex items-center gap-3">
                  <FileText className="size-5 shrink-0 text-primary" strokeWidth={2.5} />
                  <span className="text-sm font-semibold text-foreground">{doc.name}</span>
                </span>

                {doc.status === "Available" ? (
                  doc.href ? (
                    <Link
                      href={doc.href}
                      className="inline-flex shrink-0"
                    >
                      <Badge variant="accent">
                        <Download />
                        Available
                      </Badge>
                    </Link>
                  ) : (
                    <Badge variant="accent">
                      <Download />
                      Available
                    </Badge>
                  )
                ) : (
                  <span className="flex flex-col items-start gap-1 sm:items-end">
                    <Badge variant="outline">Available on Request</Badge>
                    <Link
                      href="/contact?department=SUPPORT"
                      className="text-xs text-muted-foreground underline-offset-4 hover:text-primary hover:underline"
                    >
                      Contact us
                    </Link>
                  </span>
                )}
              </Card>
            </motion.div>
          ))}
        </motion.div>
      </Container>
    </section>
  );
}

export default SecurityDocuments;
export { SecurityDocuments };
