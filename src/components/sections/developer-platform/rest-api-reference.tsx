"use client";

import { motion } from "framer-motion";

import { Container } from "@/components/ui/container";
import { SectionHeading } from "@/components/ui/section-heading";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fadeInUp, staggerContainer } from "@/animations";
import { DEVELOPER_ENDPOINTS, API_BASE_URL_NOTE } from "@/lib/developer-platform-content";

/** Every real endpoint, no invented resources. */
function RestApiReference() {
  return (
    <section id="api-reference" className="relative py-24 sm:py-32">
      <Container className="flex flex-col items-center gap-14">
        <SectionHeading
          eyebrow="REST API"
          title="4 real endpoints, documented in full"
          description={`Base URL: ${API_BASE_URL_NOTE} — Bearer-token auth on every call.`}
        />
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          className="flex w-full max-w-3xl flex-col gap-5"
        >
          {DEVELOPER_ENDPOINTS.map((endpoint) => (
            <motion.div key={endpoint.path} variants={fadeInUp}>
              <Card glass className="flex flex-col gap-3 p-5">
                <div className="flex flex-wrap items-center gap-2.5">
                  <Badge variant="accent">{endpoint.method}</Badge>
                  <code className="text-sm text-foreground">{endpoint.path}</code>
                  <Badge variant="outline">{endpoint.scope}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">{endpoint.description}</p>
                <pre className="overflow-x-auto rounded-lg bg-muted/50 p-3 text-xs text-foreground">
                  <code>{endpoint.curl}</code>
                </pre>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      </Container>
    </section>
  );
}

export default RestApiReference;
export { RestApiReference };
