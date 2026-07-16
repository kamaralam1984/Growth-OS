import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { readDocumentFile } from "@/lib/storage/documents";
import { getClientPortalSession } from "@/lib/client-portal/auth";

/**
 * Auth-gated document download — the file lives under storage/documents/
 * (never public/), and this is the only way to read it. Two independent
 * gates: an internal employee with an ACTIVE membership in the document's
 * organization, OR a Client Portal session whose client owns the document's
 * linked project AND the document is explicitly visibleToClient — never
 * shown to a client by default, per Document.visibleToClient's own doc
 * comment.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const document = await prisma.document.findUnique({ where: { id } });
  if (!document) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const session = await auth();
  const userId = session?.user?.id;

  let authorized = false;

  if (userId) {
    const membership = await prisma.membership.findUnique({
      where: { userId_organizationId: { userId, organizationId: document.organizationId } },
    });
    authorized = !!membership && membership.status === "ACTIVE";
  }

  if (!authorized) {
    const portalSession = await getClientPortalSession();
    if (portalSession && document.visibleToClient && document.organizationId === portalSession.organizationId && document.linkedProjectId) {
      const project = await prisma.project.findUnique({ where: { id: document.linkedProjectId }, select: { clientId: true } });
      authorized = !!project && project.clientId === portalSession.client.id;
    }
  }

  if (!authorized) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const buffer = await readDocumentFile(document.storageKey);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": document.mimeType,
        "Content-Disposition": `attachment; filename="${document.name.replace(/"/g, "")}"`,
        "Content-Length": String(document.sizeBytes),
      },
    });
  } catch (error) {
    console.error("[api/documents] failed to read file:", error);
    return NextResponse.json({ error: "File unavailable" }, { status: 404 });
  }
}
