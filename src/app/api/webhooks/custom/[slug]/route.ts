import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { getWebhookBySlug, decryptWebhookSecret, recordWebhookDelivery } from "@/lib/workflows/webhooks";
import { verifySignature } from "@/lib/workflows/webhook-signature";
import { startWorkflowRun } from "@/lib/workflows/engine";

// Public, unauthenticated incoming webhook receiver for user-configured
// dynamic Webhook rows (Webhook.direction === "INCOMING"), reached at
// /api/webhooks/custom/[slug] — created via src/lib/workflows/webhooks.ts's
// createWebhook(). This is this repo's OWN signing convention (distinct
// from the third-party conventions used by /api/webhooks/resend|docusign|
// adobe-sign|dropbox-sign, which each follow their provider's own
// header/scheme): a signed webhook (Webhook.encryptedSecret set) must send
// an HMAC-SHA256 hex digest of the exact raw request body, keyed by the
// webhook's own secret, in the `X-KVL-Signature` header. Unsigned webhooks
// (no encryptedSecret) are accepted without verification — an intentional,
// documented lower-security option for internal/trusted callers that can't
// easily sign requests (e.g. some no-code tools).
const SIGNATURE_HEADER = "x-kvl-signature";

function safeParseForLogging(rawBody: string): unknown {
  try {
    return JSON.parse(rawBody);
  } catch {
    return { raw: rawBody };
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let webhookId: string | null = null;

  try {
    const rate = checkRateLimit(`webhook:custom:${slug}`, { limit: 60, windowMs: 60_000 });
    if (!rate.allowed) {
      return NextResponse.json({ error: "Rate limit exceeded." }, { status: 429 });
    }

    const webhook = await getWebhookBySlug(slug);
    if (!webhook || webhook.direction !== "INCOMING" || !webhook.active) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    webhookId = webhook.id;

    const rawBody = await req.text();

    if (webhook.encryptedSecret) {
      const providedSignature = req.headers.get(SIGNATURE_HEADER);
      const secret = providedSignature ? await decryptWebhookSecret(webhook) : null;
      const valid = secret !== null && providedSignature !== null && verifySignature(secret, rawBody, providedSignature);
      if (!valid) {
        console.error(`[webhooks/custom] signature verification failed for slug ${slug} — rejecting.`);
        await recordWebhookDelivery(webhook.id, "INCOMING", safeParseForLogging(rawBody), {
          statusCode: 401,
          success: false,
          attempt: 1,
          error: "Invalid signature",
        });
        return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
      }
    }

    let parsedBody: unknown;
    try {
      parsedBody = JSON.parse(rawBody);
    } catch {
      await recordWebhookDelivery(webhook.id, "INCOMING", safeParseForLogging(rawBody), {
        statusCode: 400,
        success: false,
        attempt: 1,
        error: "Invalid JSON body",
      });
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    if (webhook.workflowId) {
      const workflow = await prisma.workflow.findUnique({ where: { id: webhook.workflowId } });
      if (workflow && workflow.status === "ACTIVE") {
        await startWorkflowRun(workflow.id, webhook.organizationId, {
          webhookSlug: slug,
          body: parsedBody,
          headers: Object.fromEntries(req.headers.entries()),
        });
      } else {
        console.warn(
          `[webhooks/custom] slug ${slug}: bound workflow ${webhook.workflowId} did not fire (` +
            (workflow ? `status ${workflow.status}, not ACTIVE` : "workflow not found") +
            ") — webhook receipt still recorded as successful.",
        );
      }
    }

    await recordWebhookDelivery(webhook.id, "INCOMING", parsedBody, {
      statusCode: 200,
      success: true,
      attempt: 1,
    });

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error) {
    console.error(`[webhooks/custom] unexpected error for slug ${slug}:`, error);
    if (webhookId) {
      try {
        await recordWebhookDelivery(webhookId, "INCOMING", { slug }, {
          statusCode: 500,
          success: false,
          attempt: 1,
          error: error instanceof Error ? error.message : String(error),
        });
      } catch (recordError) {
        console.error(`[webhooks/custom] failed to record delivery after internal error for slug ${slug}:`, recordError);
      }
    }
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
