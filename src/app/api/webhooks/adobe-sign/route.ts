import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { markParentDocumentSigned } from "@/lib/documents/signature";
import { logActivity } from "@/lib/activity";
import { logSecurityEvent } from "@/lib/security/security-events";
import type { DocumentEngineKind } from "@/lib/documents/blueprint";

// Adobe Acrobat Sign webhook receiver. Verify this payload shape against
// Adobe's current webhook documentation
// (developer.adobe.com/document-services/docs/acrobat-sign/) before relying
// on this in production — written from stable, long-documented Adobe Sign
// webhook conventions (x-adobesign-clientid header echo-back for
// verification, event.agreement.id, "AGREEMENT_ACTION_COMPLETED" /
// "AGREEMENT_WORKFLOW_COMPLETED" event types) without live doc access in
// this session.
function verifyClientId(request: Request): boolean {
  const expected = process.env.ADOBE_SIGN_CLIENT_ID;
  if (!expected) {
    console.warn("[webhooks/adobe-sign] ADOBE_SIGN_CLIENT_ID not set — cannot verify webhook client id header.");
    return true;
  }
  const header = request.headers.get("x-adobesign-clientid");
  return header === expected;
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
