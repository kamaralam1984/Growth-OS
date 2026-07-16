import { NextResponse } from "next/server";

import { getGateway } from "@/lib/billing/gateway/registry";
import { handleGatewayWebhookEvent } from "@/lib/billing/subscriptions";
import { logSecurityEvent } from "@/lib/security/security-events";
import type { PaymentGatewayProvider } from "@/generated/prisma/client";

const PROVIDER_SLUGS: Record<string, PaymentGatewayProvider> = {
  stripe: "STRIPE",
  razorpay: "RAZORPAY",
  paddle: "PADDLE",
  lemonsqueezy: "LEMONSQUEEZY",
  "bank-transfer": "BANK_TRANSFER",
  manual: "MANUAL",
};

/**
 * Real platform billing gateway webhook receiver — one route for every
 * registered PaymentGatewayProvider (PayPal is deliberately absent, see
 * src/lib/billing/gateway/registry.ts), keyed by URL slug. Reads the raw
 * body as text — required for every gateway's real HMAC/signature
 * verification; never calls request.json() first, which would consume the
 * body and break signature verification. Always returns HTTP 200 once a
 * payload has genuinely passed signature verification and been handed off
 * for processing (even if the business-logic outcome was itself a failure,
 * already logged server-side inside handleGatewayWebhookEvent) to avoid the
 * gateway's retry storm — mirrors src/app/api/webhooks/docusign/route.ts's
 * exact convention. Returns 400 only when signature verification itself
 * fails (verifyAndParseWebhook returned null), since that's a genuine
 * "reject this request" case, not a "processing happened" case.
 */
export async function POST(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider: providerSlug } = await params;
  const provider = PROVIDER_SLUGS[providerSlug.toLowerCase()];
  if (!provider) {
    return NextResponse.json({ error: `Unknown billing gateway provider "${providerSlug}".` }, { status: 404 });
  }

  const rawBody = await request.text();
  const headers = Object.fromEntries(request.headers);

  const gateway = getGateway(provider);
  const event = await gateway.verifyAndParseWebhook(rawBody, headers);

  if (!event) {
    console.error(`[webhooks/billing] ${provider} webhook signature verification failed — rejecting.`);
    void logSecurityEvent({
      type: "WEBHOOK_SIGNATURE_INVALID",
      severity: "WARNING",
      detail: `billing webhook (${provider})`,
      metadata: { provider },
    });
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  try {
    await handleGatewayWebhookEvent(provider, event);
  } catch (error) {
    // handleGatewayWebhookEvent already catches and logs its own internal
    // errors without throwing — this is a last-resort safety net so a truly
    // unexpected error here still returns 200 rather than triggering the
    // gateway's retry storm over an issue that's already been logged.
    console.error(`[webhooks/billing] ${provider} event processing threw unexpectedly:`, error);
  }

  return NextResponse.json({ ok: true });
}
