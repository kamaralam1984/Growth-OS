import { createHmac, timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { markParentDocumentSigned } from "@/lib/documents/signature";
import { logActivity } from "@/lib/activity";
import { logSecurityEvent } from "@/lib/security/security-events";
import type { DocumentEngineKind } from "@/lib/documents/blueprint";

// DocuSign Connect webhook receiver. Verify this payload shape against
// DocuSign's current Connect documentation (developers.docusign.com/platform/webhooks/connect/)
// before relying on this in production — written from stable, long-
// documented Connect conventions (JSON payload mode, HMAC-SHA256 signature
// header, envelopeId + status in envelopeSummary) without live doc access
// in this session. Configure the DocuSign Connect subscription to POST
// JSON (not the legacy XML default) to this URL.
function verifySignature(rawBody: string, signatureHeader: string | null): boolean {
  const secret = process.env.DOCUSIGN_WEBHOOK_HMAC_SECRET;
  if (!secret) {
    console.warn("[webhooks/docusign] DOCUSIGN_WEBHOOK_HMAC_SECRET not set — accepting payload WITHOUT signature verification.");
    return true;
  }
  if (!signatureHeader) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");
  const expectedBuf = Buffer.from(expected);
  const actualBuf = Buffer.from(signatureHeader);
  return expectedBuf.length === actualBuf.length && timingSafeEqual(expectedBuf, actualBuf);
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-docusign-signature-1");

  if (!verifySignature(rawBody, signature)) {
    console.error("[webhooks/docusign] signature verification failed — rejecting.");
    void logSecurityEvent({
      type: "WEBHOOK_SIGNATURE_INVALID",
      severity: "WARNING",
      detail: "docusign webhook",
    });
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  try {
    const envelopeId = extractEnvelopeId(payload);
    const status = extractStatus(payload);
    if (!envelopeId || status !== "completed") {
      return NextResponse.json({ ok: true, skipped: true });
    }

    const record = await prisma.signature.findUnique({ where: { provider_providerEnvelopeId: { provider: "DOCUSIGN", providerEnvelopeId: envelopeId } } });
    if (!record) {
      console.warn(`[webhooks/docusign] no Signature record for envelopeId ${envelopeId} — ignoring.`);
      return NextResponse.json({ ok: true, skipped: true });
    }

    await prisma.signature.update({ where: { id: record.id }, data: { status: "SIGNED", signedAt: new Date() } });
    await markParentDocumentSigned(record.docKind as unknown as DocumentEngineKind, record.docId);
    await logActivity({
      organizationId: record.organizationId,
      type: "SYSTEM_EVENT",
      description: `Signature completed via DocuSign (envelope ${envelopeId}).`,
      metadata: { signatureId: record.id, provider: "DOCUSIGN" },
    });
  } catch (error) {
    console.error("[webhooks/docusign] processing failed:", error);
    // Still 200 — DocuSign retries aggressively on non-2xx and we've already logged the real failure.
  }

  return NextResponse.json({ ok: true });
}

function extractEnvelopeId(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) return null;
  const p = payload as Record<string, unknown>;
  const direct = p.envelopeId ?? (p.data as Record<string, unknown> | undefined)?.envelopeId;
  return typeof direct === "string" ? direct : null;
}

function extractStatus(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) return null;
  const p = payload as Record<string, unknown>;
  const event = p.event;
  if (typeof event === "string" && event.toLowerCase().includes("envelope-completed")) return "completed";
  const summary = (p.data as Record<string, unknown> | undefined)?.envelopeSummary as Record<string, unknown> | undefined;
  const status = summary?.status ?? p.status;
  return typeof status === "string" ? status.toLowerCase() : null;
}
