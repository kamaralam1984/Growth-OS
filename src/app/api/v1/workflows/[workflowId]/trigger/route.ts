import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { withApiKeyAuth } from "@/lib/auth/with-api-key-auth";
import { startWorkflowRun } from "@/lib/workflows/engine";

// The triggerPayload can be any JSON object shape — the caller defines its
// own schema per-workflow — so this only enforces "plain object, not an
// array/primitive", matching the previous manual narrowing exactly.
const triggerBodySchema = z.record(z.string(), z.unknown());

/**
 * Public, API-key-gated counterpart to startWorkflowRunAction
 * (src/app/dashboard/automation/actions.ts) — the real `workflows:trigger`
 * scope this app has documented since src/lib/auth/api-key-scopes.ts was
 * written. Requires `Authorization: Bearer <key>` with that scope; the
 * workflow must belong to the key's own organization and have a real
 * TRIGGER step, exactly like the dashboard's manual "Run now" button. The
 * request body (if any, must be a JSON object) becomes the run's real
 * triggerPayload.
 */
const postWithApiKey = withApiKeyAuth("workflows:trigger", async (request, apiKeyAuth) => {
  const workflowId = new URL(request.url).pathname.split("/").at(-2);
  if (!workflowId) return NextResponse.json({ error: "Missing workflow id." }, { status: 400 });

  const workflow = await prisma.workflow.findUnique({ where: { id: workflowId } });
  if (!workflow || workflow.organizationId !== apiKeyAuth.organizationId) {
    return NextResponse.json({ error: "Workflow not found." }, { status: 404 });
  }
  if (workflow.status !== "ACTIVE") {
    return NextResponse.json({ error: "Only ACTIVE workflows can be triggered." }, { status: 409 });
  }

  let payload: Record<string, unknown> = {};
  const rawBody = await request.text();
  if (rawBody.trim().length > 0) {
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
    }

    const parsed = triggerBodySchema.safeParse(parsedJson);
    if (!parsed.success) {
      return NextResponse.json({ error: "Request body must be a JSON object." }, { status: 400 });
    }
    payload = parsed.data;
  }

  try {
    const runId = await startWorkflowRun(workflowId, apiKeyAuth.organizationId, {
      ...payload,
      triggeredBy: "api_key",
      triggeredAt: new Date().toISOString(),
    });
    return NextResponse.json({ runId }, { status: 202 });
  } catch (error) {
    console.error(`[api/v1/workflows] trigger failed for ${workflowId}:`, error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not start this workflow." }, { status: 500 });
  }
});

export async function POST(request: Request): Promise<Response> {
  return postWithApiKey(request);
}
