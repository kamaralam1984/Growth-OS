"use client";

import { motion } from "framer-motion";
import { Webhook } from "lucide-react";

import { Container } from "@/components/ui/container";
import { SectionHeading } from "@/components/ui/section-heading";
import { Card } from "@/components/ui/card";
import { fadeInUp } from "@/animations";

const VERIFY_SNIPPET = `import crypto from "crypto";

function verifySignature(secret, rawBody, signatureHeader) {
  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");
  return crypto.timingSafeEqual(
    Buffer.from(expected),
    Buffer.from(signatureHeader)
  );
}`;

/**
 * Real outbound webhook signing exists (src/lib/workflows/webhook-signature.ts
 * — HMAC-SHA256, timing-safe verify) — wired into workflow "outgoing
 * webhook" steps. There's no fixed catalog of typed events yet (delivery is
 * generic/workflow-triggered), so this section is honest about that.
 */
function WebhooksDocs() {
  return (
    <section className="relative py-24 sm:py-32">
      <Container className="flex flex-col items-center gap-10">
        <SectionHeading
          eyebrow="Webhooks"
          title="Real HMAC-signed webhook delivery"
          description="Every webhook we send is signed, with automatic retry on failure. There's no fixed catalog of event types yet — webhooks are configured per Automation Builder workflow, not a platform-wide event bus."
        />
        <motion.div variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true }} className="w-full max-w-2xl">
          <Card glass className="flex flex-col gap-4 p-6">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Webhook className="size-4 text-primary" strokeWidth={2.5} />
              Verify a webhook signature (real HMAC-SHA256)
            </div>
            <pre className="overflow-x-auto rounded-lg bg-muted/50 p-3 text-xs text-foreground">
              <code>{VERIFY_SNIPPET}</code>
            </pre>
            <p className="text-xs text-muted-foreground">
              Every outbound webhook request carries a signature header computed the same way — configure webhook steps
              from the Automation Builder in your dashboard.
            </p>
          </Card>
        </motion.div>
      </Container>
    </section>
  );
}

export default WebhooksDocs;
export { WebhooksDocs };
