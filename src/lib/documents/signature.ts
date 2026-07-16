import { randomUUID } from "node:crypto";

import { prisma } from "@/lib/prisma";
import { getConnection, getFreshAccessToken } from "@/lib/integrations/connection-store";
import { recordAPIUsage } from "@/lib/api-usage";
import { getAppBaseUrl } from "./tracking";
import type { DocumentEngineKind } from "./blueprint";
import type { DocumentKind, SignatureProvider } from "@/generated/prisma/client";

export function generateSignatureToken(): string {
  return randomUUID();
}

export function getSigningUrl(token: string, baseUrl: string = getAppBaseUrl()): string {
  return `${baseUrl}/sign/${token}`;
}

/**
 * Flips the signed document's own status field once its Signature record
 * is marked SIGNED — Contract is the primary real-world use case (a
 * software agreement isn't binding until signed), but this is written
 * generically since Proposals and other document kinds can also carry a
 * signature block. Never throws — a status-sync failure must not break
 * the signing flow that already recorded the real signature.
 */
export async function markParentDocumentSigned(kind: DocumentEngineKind, docId: string): Promise<void> {
  try {
    switch (kind) {
      case "CONTRACT":
        await prisma.contract.update({ where: { id: docId }, data: { status: "SIGNED", signedAt: new Date() } });
        break;
      case "PROPOSAL":
        await prisma.proposal.update({ where: { id: docId }, data: { status: "ACCEPTED", acceptedAt: new Date() } });
        break;
      case "QUOTATION":
        await prisma.quotation.update({ where: { id: docId }, data: { status: "ACCEPTED", acceptedAt: new Date() } });
        break;
      case "BUSINESS_DOCUMENT":
        await prisma.businessDocument.update({ where: { id: docId }, data: { status: "ACCEPTED" } });
        break;
      default:
        break;
    }
  } catch (error) {
    console.error("[documents/signature] markParentDocumentSigned failed:", error);
  }
}

/**
 * Verify this two-step flow against Adobe Acrobat Sign's current API docs
 * before relying on this in production — written from stable, documented
 * Acrobat Sign v6 conventions (transient document upload, then agreement
 * creation) without live doc access this session.
 */
export async function createAdobeSignAgreement(
  organizationId: string,
  docKind: DocumentEngineKind,
  docId: string,
  documentBuffer: Buffer,
  documentTitle: string,
  signer: { name: string; email: string },
): Promise<{ ok: true; envelopeId: string } | { ok: false; reason: "not_connected" | "failed"; error?: string }> {
  const connection = await getConnection(organizationId, "ADOBE_SIGN");
  if (!connection || connection.status !== "CONNECTED") return { ok: false, reason: "not_connected" };

  const accessToken = await getFreshAccessToken(organizationId, "ADOBE_SIGN");
  if (!accessToken) return { ok: false, reason: "not_connected" };

  const shard = (connection.metadata?.shard as string | undefined) ?? "na1";
  const apiHost = `https://api.${shard}.adobesign.com`;

  let transientDocumentId: string;
  try {
    const form = new FormData();
    form.append("File-Name", `${documentTitle}.pdf`);
    form.append("File", new Blob([new Uint8Array(documentBuffer)], { type: "application/pdf" }));
    form.append("Mime-Type", "application/pdf");

    const uploadEndpoint = `${apiHost}/api/rest/v6/transientDocuments`;
    const uploadStart = Date.now();
    const uploadResponse = await fetch(uploadEndpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form,
    });
    void recordAPIUsage({
      organizationId,
      integrationConnectionId: connection.id,
      endpoint: uploadEndpoint,
      method: "POST",
      statusCode: uploadResponse.status,
      responseTimeMs: Date.now() - uploadStart,
    });
    const uploadBody = (await uploadResponse.json().catch(() => ({}))) as { transientDocumentId?: string };
    if (!uploadResponse.ok || !uploadBody.transientDocumentId) {
      return {
        ok: false,
        reason: "failed",
        error: `Adobe Sign transient document upload failed (HTTP ${uploadResponse.status}): ${JSON.stringify(uploadBody)}`,
      };
    }
    transientDocumentId = uploadBody.transientDocumentId;
  } catch (error) {
    return {
      ok: false,
      reason: "failed",
      error: `Adobe Sign transient document upload request failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  try {
    const agreementEndpoint = `${apiHost}/api/rest/v6/agreements`;
    const agreementStart = Date.now();
    const agreementResponse = await fetch(agreementEndpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        fileInfos: [{ transientDocumentId }],
        name: documentTitle,
        participantSetsInfo: [{ memberInfos: [{ email: signer.email }], order: 1, role: "SIGNER" }],
        signatureType: "ESIGN",
        state: "IN_PROCESS",
      }),
    });
    void recordAPIUsage({
      organizationId,
      integrationConnectionId: connection.id,
      endpoint: agreementEndpoint,
      method: "POST",
      statusCode: agreementResponse.status,
      responseTimeMs: Date.now() - agreementStart,
    });
    const agreementBody = (await agreementResponse.json().catch(() => ({}))) as { id?: string };
    if (!agreementResponse.ok || !agreementBody.id) {
      return {
        ok: false,
        reason: "failed",
        error: `Adobe Sign agreement creation failed (HTTP ${agreementResponse.status}): ${JSON.stringify(agreementBody)}`,
      };
    }
    return { ok: true, envelopeId: agreementBody.id };
  } catch (error) {
    return {
      ok: false,
      reason: "failed",
      error: `Adobe Sign agreement creation request failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Verify this against Dropbox Sign's current API docs (developers.hellosign.com)
 * before relying on this in production — written from stable, documented v3
 * API conventions without live doc access this session.
 *
 * Creates a real Dropbox Sign (HelloSign) signature request via the v3
 * `/signature_request/send` endpoint. `docKind`/`docId` identify the
 * document being signed; callers are responsible for persisting the
 * returned `envelopeId` on the corresponding Signature row as
 * `providerEnvelopeId` so the Dropbox Sign webhook receiver can find it
 * again once the signer completes.
 */
export async function createDropboxSignRequest(
  organizationId: string,
  docKind: DocumentEngineKind,
  docId: string,
  documentBuffer: Buffer,
  documentTitle: string,
  signer: { name: string; email: string },
): Promise<{ ok: true; envelopeId: string } | { ok: false; reason: "not_connected" | "failed"; error?: string }> {
  void docKind;
  void docId;

  const connection = await getConnection(organizationId, "DROPBOX_SIGN");
  if (!connection || connection.status !== "CONNECTED") return { ok: false, reason: "not_connected" };

  const token = await getFreshAccessToken(organizationId, "DROPBOX_SIGN");
  if (!token) return { ok: false, reason: "not_connected" };

  try {
    const form = new FormData();
    form.append("title", documentTitle);
    form.append("subject", `Please sign: ${documentTitle}`);
    form.append("signers[0][email_address]", signer.email);
    form.append("signers[0][name]", signer.name);
    form.append("file[0]", new Blob([new Uint8Array(documentBuffer)], { type: "application/pdf" }), `${documentTitle}.pdf`);

    const endpoint = "https://api.hellosign.com/v3/signature_request/send";
    const start = Date.now();
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    void recordAPIUsage({
      organizationId,
      integrationConnectionId: connection.id,
      endpoint,
      method: "POST",
      statusCode: response.status,
      responseTimeMs: Date.now() - start,
    });

    if (!response.ok) {
      const error = await response.text();
      return { ok: false, reason: "failed", error };
    }

    const data = (await response.json()) as { signature_request?: { signature_request_id?: string } };
    const envelopeId = data.signature_request?.signature_request_id;
    if (!envelopeId) return { ok: false, reason: "failed", error: "Dropbox Sign response missing signature_request_id." };

    return { ok: true, envelopeId };
  } catch (error) {
    return { ok: false, reason: "failed", error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Verify this against DocuSign's current eSignature REST API docs
 * (developers.docusign.com/docs/esign-rest-api/) before relying on this in
 * production — written from stable, long-documented v2.1 conventions
 * without live doc access this session.
 *
 * Creates a real DocuSign envelope via POST
 * `{baseUri}/restapi/v2.1/accounts/{accountId}/envelopes`. `docKind`/
 * `docId` identify the document being signed; callers persist the returned
 * `envelopeId` on the corresponding Signature row as `providerEnvelopeId`
 * so the DocuSign webhook receiver (src/app/api/webhooks/docusign/route.ts)
 * can find it again once the signer completes.
 *
 * Signature placement uses an anchorString ("/sig1/") tab rather than an
 * absolute-position tab: pdf-renderer.ts's signature page lays parties out
 * dynamically (column position depends on party count and page overflow),
 * so it doesn't hand back per-party pixel coordinates, and computing them
 * here would duplicate that layout logic. The anchor string is instead
 * rendered directly into the PDF's text layer by renderSignaturePage when
 * DocumentBlueprint.docusignAnchor is set — see blueprint.ts. Callers that
 * want the DocuSign tab to actually land on the page must build their
 * blueprint with docusignAnchor: true before rendering documentBuffer.
 */
export async function createDocuSignEnvelope(
  organizationId: string,
  docKind: DocumentEngineKind,
  docId: string,
  documentBuffer: Buffer,
  documentTitle: string,
  signer: { name: string; email: string },
): Promise<{ ok: true; envelopeId: string } | { ok: false; reason: "not_connected" | "failed"; error?: string }> {
  void docKind;
  void docId;

  const connection = await getConnection(organizationId, "DOCUSIGN");
  if (!connection || connection.status !== "CONNECTED") return { ok: false, reason: "not_connected" };

  const accessToken = await getFreshAccessToken(organizationId, "DOCUSIGN");
  if (!accessToken) return { ok: false, reason: "not_connected" };

  const accountId = connection.metadata?.accountId as string | undefined;
  const baseUri = connection.metadata?.baseUri as string | undefined;
  if (!accountId || !baseUri) {
    return { ok: false, reason: "failed", error: "DocuSign connection is missing accountId/baseUri metadata — reconnect the integration." };
  }

  try {
    const endpoint = `${baseUri}/restapi/v2.1/accounts/${accountId}/envelopes`;
    const start = Date.now();
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        emailSubject: `Please sign: ${documentTitle}`,
        documents: [{ documentBase64: documentBuffer.toString("base64"), name: documentTitle, fileExtension: "pdf", documentId: "1" }],
        recipients: {
          signers: [
            {
              email: signer.email,
              name: signer.name,
              recipientId: "1",
              routingOrder: "1",
              tabs: { signHereTabs: [{ anchorString: "/sig1/", anchorUnits: "pixels", anchorXOffset: "0", anchorYOffset: "0" }] },
            },
          ],
        },
        status: "sent",
      }),
    });
    void recordAPIUsage({
      organizationId,
      integrationConnectionId: connection.id,
      endpoint,
      method: "POST",
      statusCode: response.status,
      responseTimeMs: Date.now() - start,
    });

    const body = (await response.json().catch(() => ({}))) as { envelopeId?: string };
    if (!response.ok || !body.envelopeId) {
      return { ok: false, reason: "failed", error: `DocuSign envelope creation failed (HTTP ${response.status}): ${JSON.stringify(body)}` };
    }
    return { ok: true, envelopeId: body.envelopeId };
  } catch (error) {
    return { ok: false, reason: "failed", error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Single orchestration entry point future call sites should use instead of
 * directly generating a manual token: tries a real DocuSign envelope first
 * (only when this org actually has DocuSign connected), then a real Adobe
 * Sign agreement, then a real Dropbox Sign signature request, and
 * transparently falls back to the internal MANUAL token flow if no provider
 * is connected or every call fails — the user is never blocked from getting
 * SOME signing method. Creates the Signature row itself in every case.
 */
export async function requestSignature(
  organizationId: string,
  docKind: DocumentEngineKind,
  docId: string,
  documentBuffer: Buffer,
  documentTitle: string,
  signer: { name: string; email: string },
  requestedByUserId?: string,
): Promise<{ provider: SignatureProvider; envelopeId?: string; token?: string }> {
  const docuSign = await createDocuSignEnvelope(organizationId, docKind, docId, documentBuffer, documentTitle, signer);
  if (docuSign.ok) {
    await prisma.signature.create({
      data: {
        organizationId,
        docKind: docKind as DocumentKind,
        docId,
        signerName: signer.name,
        signerEmail: signer.email,
        provider: "DOCUSIGN",
        status: "PENDING",
        signatureToken: generateSignatureToken(),
        providerEnvelopeId: docuSign.envelopeId,
        requestedByUserId,
      },
    });
    return { provider: "DOCUSIGN", envelopeId: docuSign.envelopeId };
  }

  const adobeSign = await createAdobeSignAgreement(organizationId, docKind, docId, documentBuffer, documentTitle, signer);
  if (adobeSign.ok) {
    await prisma.signature.create({
      data: {
        organizationId,
        docKind: docKind as DocumentKind,
        docId,
        signerName: signer.name,
        signerEmail: signer.email,
        provider: "ADOBE_SIGN",
        status: "PENDING",
        signatureToken: generateSignatureToken(),
        providerEnvelopeId: adobeSign.envelopeId,
        requestedByUserId,
      },
    });
    return { provider: "ADOBE_SIGN", envelopeId: adobeSign.envelopeId };
  }

  const dropboxSign = await createDropboxSignRequest(organizationId, docKind, docId, documentBuffer, documentTitle, signer);
  if (dropboxSign.ok) {
    await prisma.signature.create({
      data: {
        organizationId,
        docKind: docKind as DocumentKind,
        docId,
        signerName: signer.name,
        signerEmail: signer.email,
        provider: "DROPBOX_SIGN",
        status: "PENDING",
        signatureToken: generateSignatureToken(),
        providerEnvelopeId: dropboxSign.envelopeId,
        requestedByUserId,
      },
    });
    return { provider: "DROPBOX_SIGN", envelopeId: dropboxSign.envelopeId };
  }

  const token = generateSignatureToken();
  await prisma.signature.create({
    data: {
      organizationId,
      docKind: docKind as DocumentKind,
      docId,
      signerName: signer.name,
      signerEmail: signer.email,
      provider: "MANUAL",
      status: "PENDING",
      signatureToken: token,
      requestedByUserId,
    },
  });
  return { provider: "MANUAL", token };
}
