"use client";

import { motion } from "framer-motion";
import { AlertTriangle } from "lucide-react";

import { Container } from "@/components/ui/container";
import { SectionHeading } from "@/components/ui/section-heading";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fadeInUp, staggerContainer } from "@/animations";

interface ErrorEntry {
  status: string;
  label: string;
  body: string;
  fix: string;
}

// Real, verified error shapes from src/lib/auth/with-api-key-auth.ts — every
// API error uses this exact { "error": string } body, no code field.
const ERRORS: ErrorEntry[] = [
  { status: "401", label: "Invalid or missing API key", body: `{ "error": "Invalid or missing API key." }`, fix: "Check your Authorization header is exactly `Bearer YOUR_API_KEY`." },
  { status: "403", label: "Missing scope", body: `{ "error": "This API key does not have the '<scope>' scope." }`, fix: "Generate a new key with the required scope from API settings." },
  { status: "429", label: "Rate limit exceeded", body: `{ "error": "Rate limit exceeded." }`, fix: "Back off and retry after your rolling 1-hour window resets." },
];

function ErrorReference() {
  return (
    <section className="relative py-24 sm:py-32">
      <Container className="flex flex-col items-center gap-14">
        <SectionHeading eyebrow="Errors" title="Error reference" description="Every real error shape the API returns, verbatim." />
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          className="flex w-full max-w-3xl flex-col gap-4"
        >
          {ERRORS.map((err) => (
            <motion.div key={err.status} variants={fadeInUp}>
              <Card glass className="flex flex-col gap-3 p-5">
                <div className="flex items-center gap-2.5">
                  <AlertTriangle className="size-4 text-amber-500" strokeWidth={2.5} />
                  <Badge variant="outline">{err.status}</Badge>
                  <span className="text-sm font-semibold text-foreground">{err.label}</span>
                </div>
                <pre className="overflow-x-auto rounded-lg bg-muted/50 p-3 text-xs text-foreground">
                  <code>{err.body}</code>
                </pre>
                <p className="text-sm text-muted-foreground">{err.fix}</p>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      </Container>
    </section>
  );
}

export default ErrorReference;
export { ErrorReference };
