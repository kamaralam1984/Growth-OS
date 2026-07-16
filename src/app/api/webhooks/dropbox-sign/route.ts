import { createHmac, timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { markParentDocumentSigned } from "@/lib/documents/signature";
import { logActivity } from "@/lib/activity";
import { logSecurityEvent } from "@/lib/security/security-events";
import type { DocumentEngineKind } from "@/lib/documents/blueprint";

// Dropbox Sign (HelloSign) event webhook receiver. Real, documented scheme
// (developers.hellosign.com/docs/guides/events-and-callbacks): every event
// payload's `event.event_hash` is HMAC-SHA256 of `event_time + event_type`
// (concatenated, no separator), keyed by the receiving account's API key —
// NOT a plain hash of "apiKey + full JSON body" (an earlier version of this
// handler used that non-standard, non-HMAC scheme, which would never have
// matched a real Dropbox Sign callback). Verified with timingSafeEqual.
function verifySignature(apiKey: string | undefined, eventTime: string | null, eventType: string | null, eventHash: string | null): boolean {
  if (!apiKey) {
    console.error("[webhooks/dropbox-sign] DROPBOX_SIGN_CLIENT_SECRET not set — rejecting payload (integration Not Configured).");
    return false;
  }
  if (!eventTime || !eventType || !eventHash) return false;
  const expected = createHmac("sha256", apiKey).update(eventTime + eventType).digest("hex");
  const expectedBuf = Buffer.from(expected);
  const actualBuf = Buffer.from(eventHash);
  return expectedBuf.length === actualBuf.length && timingSafeEqual(expectedBuf, actualBuf);
}

export async function POST(request: Request) {
  const form = await request.formData();
  const rawJson = form.get("json");
  if (typeof rawJson !== "string") return NextResponse.json({ error: "Missing json field." }, { status: 400 });

  let payload: unknown;
  try {
    payload = JSON.parse(rawJson);
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const { eventTime, eventHash } = extractCallbackSignatureFields(payload);
  const { eventType } = extractEvent(payload);
  if (!verifySignature(process.env.DROPBOX_SIGN_CLIENT_SECRET, eventTime, eventType, eventHash)) {
    console.error("[webhooks/dropbox-sign] signature verification failed — rejecting.");
    void logSecurityEvent({
      type: "WEBHOOK_SIGNATURE_INVALID",
      severity: "WARNING",
      detail: "dropbox-sign webhook",
    });
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }

  try {
    const { requestId } = extractEvent(payload);
    const isCompleted = eventType === "signature_request_all_signed";
    if (requestId && isCompleted) {
      const record = await prisma.signature.findUnique({ where: { provider_providerEnvelopeId: { provider: "DROPBOX_SIGN", providerEnvelopeId: requestId } } });
      if (record) {
        await prisma.signature.update({ where: { id: record.id }, data: { status: "SIGNED", signedAt: new Date() } });
        await markParentDocumentSigned(record.docKind as unknown as DocumentEngineKind, record.docId);
        await logActivity({
          organizationId: record.organizationId,
          type: "SYSTEM_EVENT",
          description: `Signature completed via Dropbox Sign (request ${requestId}).`,
          metadata: { signatureId: record.id, provider: "DROPBOX_SIGN" },
        });
      } else {
        console.warn(`[webhooks/dropbox-sign] no Signature record for signature_request_id ${requestId} — ignoring.`);
      }
    }
  } catch (error) {
    console.error("[webhooks/dropbox-sign] processing failed:", error);
  }

  // Dropbox Sign requires the literal string "Hello API Event Received" as the response body to acknowledge.
  return new NextResponse("Hello API Event Received", { status: 200 });
}

function extractCallbackSignatureFields(payload: unknown): { eventTime: string | null; eventHash: string | null } {
  if (typeof payload !== "object" || payload === null) return { eventTime: null, eventHash: null };
  const event = (payload as Record<string, unknown>).event as Record<string, unknown> | undefined;
  const time = event?.event_time;
  const hash = event?.event_hash;
  return {
    eventTime: typeof time === "string" ? time : null,
    eventHash: typeof hash === "string" ? hash : null,
  };
}

function extractEvent(payload: unknown): { requestId: string | null; eventType: string | null } {
  if (typeof payload !== "object" || payload === null) return { requestId: null, eventType: null };
  const p = payload as Record<string, unknown>;
  const event = p.event as Record<string, unknown> | undefined;
  const eventType = event?.event_type;
  const signatureRequest = p.signature_request as Record<string, unknown> | undefined;
  const requestId = signatureRequest?.signature_request_id;
  return {
    requestId: typeof requestId === "string" ? requestId : null,
    eventType: typeof eventType === "string" ? eventType : null,
  };
}
