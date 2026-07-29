"use client";

import { motion } from "framer-motion";
import { Braces } from "lucide-react";

import { Container } from "@/components/ui/container";
import { SectionHeading } from "@/components/ui/section-heading";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fadeInUp } from "@/animations";

const SCHEMA_SNIPPET = `type Query {
  apiKeyInfo: ApiKeyInfo
}

type Mutation {
  triggerWorkflow(workflowId: String!): TriggerResult
}

type ApiKeyInfo {
  organizationId: String!
  scopes: [String!]!
  rateLimitPerHour: Int!
}

type TriggerResult {
  runId: String!
}`;

const EXAMPLE_QUERY = `curl -X POST "https://growthos.kvlbusinesssolutions.com/api/graphql" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"query": "{ apiKeyInfo { organizationId scopes rateLimitPerHour } }"}'`;

/**
 * A real, minimal GraphQL endpoint (src/app/api/graphql/route.ts) — one
 * query, one mutation, deliberately not a full CRUD schema. Honest about
 * the narrow scope rather than implying feature parity with REST.
 */
function GraphqlApi() {
  return (
    <section className="relative py-24 sm:py-32">
      <Container className="flex flex-col items-center gap-10">
        <SectionHeading
          eyebrow="GraphQL"
          title="A real, minimal GraphQL endpoint"
          description="One query, one mutation today — the same real auth and business logic as the REST API, exposed through GraphQL. Not yet a full schema."
        />
        <motion.div variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true }} className="grid w-full max-w-3xl gap-5 sm:grid-cols-2">
          <Card glass className="flex flex-col gap-3 p-5">
            <div className="flex items-center gap-2">
              <Braces className="size-4 text-primary" strokeWidth={2.5} />
              <span className="text-sm font-semibold text-foreground">Schema</span>
              <Badge variant="accent">POST /api/graphql</Badge>
            </div>
            <pre className="overflow-x-auto rounded-lg bg-muted/50 p-3 text-xs text-foreground">
              <code>{SCHEMA_SNIPPET}</code>
            </pre>
          </Card>
          <Card glass className="flex flex-col gap-3 p-5">
            <span className="text-sm font-semibold text-foreground">Example request</span>
            <pre className="overflow-x-auto rounded-lg bg-muted/50 p-3 text-xs text-foreground">
              <code>{EXAMPLE_QUERY}</code>
            </pre>
            <p className="text-xs text-muted-foreground">
              Auth failures return GraphQL&apos;s own error envelope (<code>{"{ errors: [...] }"}</code>), not the REST
              API&apos;s <code>{"{ error }"}</code> shape.
            </p>
          </Card>
        </motion.div>
      </Container>
    </section>
  );
}

export default GraphqlApi;
export { GraphqlApi };
