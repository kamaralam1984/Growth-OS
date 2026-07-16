import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { markParentDocumentSigned } from "@/lib/documents/signature";
import { logActivity } from "@/lib/activity";
import { logSecurityEvent } from "@/lib/security/security-events";
import type { DocumentEngineKind } from "@/lib/documents/blueprint";

// Adobe Acrobat Sign webhook receiver. This IS Adobe's real, documented
// verification mechanism (helpx.adobe.com/sign/developer/webhook/overview.html) —
// Acrobat Sign has no separate HMAC-signed-webhook option for this product;
// every notification carries an `X-AdobeSign-ClientId` header set to the
// client ID (Application ID) of the app that registered the webhook, and
// registration itself requires this endpoint to answer a verification
// handshake (see the GET handler below). It's weaker than a true shared
// secret — a client ID isn't meant to be secret the way an HMAC key is —
// but implementing it correctly (fail-closed, real handshake) is Adobe's
// actual security model for this product, not a stand-in for one.
function verifyClientId(request: Request): boolean {
  const expected = process.env.ADOBE_SIGN_CLIENT_ID;
  if (!expected) {
    console.error("[webhooks/adobe-sign] ADOBE_SIGN_CLIENT_ID not set — rejecting payload (integration Not Configured).");
    return false;
  }
  const header = request.headers.get("x-adobesign-clientid");
  return header === expected;
}

// Webhook registration handshake: when a webhook is created/verified in
// Acrobat Sign, it sends a GET request to this URL carrying
// `X-AdobeSign-ClientId`, and expects a 2XX response that echoes the same
// client ID back — either as a response header or as JSON
// `{ xAdobeSignClientId: "..." }`. Without this, registering a real
// webhook against this endpoint would never succeed.
export async function GET(request: Request) {
  const expected = process.env.ADOBE_SIGN_CLIENT_ID;
  const header = request.headers.get("x-adobesign-clientid");
  if (!expected || header !== expected) {
    return NextResponse.json({ error: "Client id mismatch or ADOBE_SIGN_CLIENT_ID not configured." }, { status: 401 });
  }
  return NextResponse.json(
    { xAdobeSignClientId: expected },
    { status: 200, headers: { "X-AdobeSign-ClientId": expected } },
  );
}

export async function POST(request: Request) {
  if (!verifyClientId(request)) {
    console.error("[webhooks/adobe-sign] client id header mismatch — rejecting.");
    void logSecurityEvent({
      type: "WEBHOOK_SIGNATURE_INVALID",
      severity: "WARNING",
      detail: "adobe-sign webhook",
    });
    return NextResponse.json({ error: "Invalid client id." }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  try {
    const agreementId = extractAgreementId(payload);
    const eventName = extractEventName(payload);
    const isCompleted = typeof eventName === "string" && /COMPLETED|SIGNED/i.test(eventName);
    if (!agreementId || !isCompleted) {
      return NextResponse.json({ ok: true, skipped: true });
    }

    const record = await prisma.signature.findUnique({ where: { provider_providerEnvelopeId: { provider: "ADOBE_SIGN", providerEnvelopeId: agreementId } } });
    if (!record) {
      console.warn(`[webhooks/adobe-sign] no Signature record for agreementId ${agreementId} — ignoring.`);
      return NextResponse.json({ ok: true, skipped: true });
    }

    await prisma.signature.update({ where: { id: record.id }, data: { status: "SIGNED", signedAt: new Date() } });
    await markParentDocumentSigned(record.docKind as unknown as DocumentEngineKind, record.docId);
    await logActivity({
      organizationId: record.organizationId,
      type: "SYSTEM_EVENT",
      description: `Signature completed via Adobe Sign (agreement ${agreementId}).`,
      metadata: { signatureId: record.id, provider: "ADOBE_SIGN" },
    });
  } catch (error) {
    console.error("[webhooks/adobe-sign] processing failed:", error);
  }

  return NextResponse.json({ ok: true });
}

function extractAgreementId(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) return null;
  const p = payload as Record<string, unknown>;
  const agreement = (p.agreement as Record<string, unknown> | undefined) ?? (p.event as Record<string, unknown> | undefined)?.agreement as Record<string, unknown> | undefined;
  const id = agreement?.id ?? p.agreementId;
  return typeof id === "string" ? id : null;
}

function extractEventName(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) return null;
  const p = payload as Record<string, unknown>;
  const name = p.event ?? p.eventType ?? p.name;
  return typeof name === "string" ? name : null;
}
