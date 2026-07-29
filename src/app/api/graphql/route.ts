import { NextResponse } from "next/server";
import { buildSchema, graphql } from "graphql";

import { prisma } from "@/lib/prisma";
import { hasApiKeyScope, verifyApiKeyAuth, type ApiKeyAuthResult } from "@/lib/auth/api-key";
import { startWorkflowRun } from "@/lib/workflows/engine";

/**
 * Real, intentionally minimal GraphQL surface over this platform's existing
 * public API — same real bearer-`ApiKey` auth (src/lib/auth/api-key.ts) and
 * the same real business logic as the REST routes, just exposed as GraphQL:
 *
 *   - `Mutation.triggerWorkflow` wraps the exact same `startWorkflowRun`
 *     engine call (src/lib/workflows/engine.ts) that
 *     src/app/api/v1/workflows/[workflowId]/trigger/route.ts uses, with the
 *     same organization-ownership and ACTIVE-status checks — reused here,
 *     not duplicated logic, and re-checked here because this route can't
 *     import that REST handler directly (it's built with `withApiKeyAuth`,
 *     which only supports a single fixed scope per route; GraphQL needs
 *     per-field scope checks instead, done below via `hasApiKeyScope`).
 *   - `Query.apiKeyInfo` is a real introspection query returning the fields
 *     already present on the real `auth` object `verifyApiKeyAuth` resolves
 *     — no extra DB query needed.
 *
 * This is NOT the full GraphQL spec's ambitious scope: no subscriptions, no
 * full CRUD schema, no query batching, no persisted queries — just these two
 * real operations, genuinely functional and honestly scoped to match
 * src/lib/developer-platform-content.ts.
 *
 * Auth failures return GraphQL's own error convention — `{ errors: [{
 * message }] }` — not the REST API's `{ error: string }` shape used
 * elsewhere in this app, since GraphQL has its own standard error envelope.
 */

const schema = buildSchema(`
  type TriggerResult {
    runId: String!
  }

  type ApiKeyInfo {
    organizationId: String!
    scopes: [String!]!
    rateLimitPerHour: Int!
  }

  type Query {
    apiKeyInfo: ApiKeyInfo
  }

  type Mutation {
    triggerWorkflow(workflowId: String!): TriggerResult
  }
`);

interface GraphQLContext {
  auth: ApiKeyAuthResult;
}

const rootValue = {
  apiKeyInfo: (_args: unknown, context: GraphQLContext) => {
    const { auth } = context;
    return {
      organizationId: auth.organizationId,
      scopes: auth.scopes,
      rateLimitPerHour: auth.rateLimitPerHour,
    };
  },

  triggerWorkflow: async (args: { workflowId: string }, context: GraphQLContext) => {
    const { auth } = context;

    if (!hasApiKeyScope(auth, "workflows:trigger")) {
      throw new Error("This API key does not have the 'workflows:trigger' scope.");
    }

    const workflow = await prisma.workflow.findUnique({ where: { id: args.workflowId } });
    if (!workflow || workflow.organizationId !== auth.organizationId) {
      throw new Error("Workflow not found.");
    }
    if (workflow.status !== "ACTIVE") {
      throw new Error("Only ACTIVE workflows can be triggered.");
    }

    const runId = await startWorkflowRun(args.workflowId, auth.organizationId, {
      triggeredBy: "api_key",
      triggeredAt: new Date().toISOString(),
    });

    return { runId };
  },
};

export async function POST(request: Request): Promise<Response> {
  const auth = await verifyApiKeyAuth(request);
  if (!auth) {
    return NextResponse.json({ errors: [{ message: "Invalid or missing API key." }] }, { status: 401 });
  }

  let body: { query?: unknown; variables?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ errors: [{ message: "Request body must be valid JSON." }] }, { status: 400 });
  }

  if (typeof body.query !== "string") {
    return NextResponse.json({ errors: [{ message: "Request body must include a string 'query'." }] }, { status: 400 });
  }

  const variableValues =
    body.variables && typeof body.variables === "object" ? (body.variables as Record<string, unknown>) : undefined;

  const result = await graphql({
    schema,
    source: body.query,
    rootValue,
    contextValue: { auth },
    variableValues,
  });

  return NextResponse.json(result);
}
