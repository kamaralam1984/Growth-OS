"use client";

import { motion } from "framer-motion";
import { CheckCircle2, XCircle } from "lucide-react";

import { Container } from "@/components/ui/container";
import { SectionHeading } from "@/components/ui/section-heading";
import { Card } from "@/components/ui/card";
import { fadeInUp, staggerContainer } from "@/animations";
import { AUTH_METHODS } from "@/lib/developer-platform-content";

function AuthenticationCenter() {
  return (
    <section className="relative py-24 sm:py-32">
      <Container className="flex flex-col items-center gap-14">
        <SectionHeading eyebrow="Authentication" title="How authentication actually works" description="Real methods only — no SSO/SAML claims that aren't true yet." />
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          className="grid w-full grid-cols-1 gap-5 sm:grid-cols-2"
        >
          {AUTH_METHODS.map((method) => (
            <motion.div key={method.name} variants={fadeInUp}>
              <Card glass className="flex items-start gap-3 p-6">
                {method.status === "Available" ? (
                  <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-primary" strokeWidth={2.5} />
                ) : (
                  <XCircle className="mt-0.5 size-5 shrink-0 text-muted-foreground" strokeWidth={2.5} />
                )}
                <div className="flex flex-col gap-1">
                  <h3 className="text-base font-semibold text-foreground">{method.name}</h3>
                  <p className="text-sm text-muted-foreground">{method.description}</p>
                </div>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      </Container>
    </section>
  );
}

export default AuthenticationCenter;
export { AuthenticationCenter };
