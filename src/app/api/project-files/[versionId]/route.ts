import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { readProjectFileVersion } from "@/lib/storage/project-files";
import { getClientPortalSession } from "@/lib/client-portal/auth";

/**
 * Auth-gated ProjectFileVersion download/preview — the file lives under
 * storage/project-files/ (never public/), and this is the only way to read
 * it. Mirrors src/app/api/documents/[id]/route.ts's two independent gates:
 * an internal employee with an ACTIVE membership in the file's
 * organization, OR a Client Portal session whose client owns the file's
 * project AND the ProjectFile is explicitly visibleToClient. A portal
 * session may only ever reach the CURRENT (highest versionNumber) version —
 * older versions are an internal-only surface.
 *
 * Uses an inline Content-Disposition (rather than Document's attachment) so
 * image/PDF preview surfaces (<img>, <iframe>) can render this URL directly;
 * the file list's own "Download" link forces a save via the anchor's
 * `download` attribute.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ versionId: string }> }) {
  const { versionId } = await params;

  const version = await prisma.projectFileVersion.findUnique({
    where: { id: versionId },
    include: { projectFile: true },
  });
  if (!version) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const session = await auth();
  const userId = session?.user?.id;

  let authorized = false;

  if (userId) {
    const membership = await prisma.membership.findUnique({
      where: { userId_organizationId: { userId, organizationId: version.projectFile.organizationId } },
    });
    authorized = !!membership && membership.status === "ACTIVE";
  }

  if (!authorized) {
    const portalSession = await getClientPortalSession();
    if (portalSession && version.projectFile.visibleToClient && version.projectFile.organizationId === portalSession.organizationId) {
      const [project, latest] = await Promise.all([
        prisma.project.findUnique({ where: { id: version.projectFile.projectId }, select: { clientId: true } }),
        prisma.projectFileVersion.findFirst({ where: { projectFileId: version.projectFileId }, orderBy: { versionNumber: "desc" }, select: { id: true } }),
      ]);
      authorized = !!project && project.clientId === portalSession.client.id && latest?.id === version.id;
    }
  }

  if (!authorized) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const buffer = await readProjectFileVersion(version.storageKey);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": version.mimeType,
        "Content-Disposition": `inline; filename="${version.projectFile.name.replace(/"/g, "")}"`,
        "Content-Length": String(version.sizeBytes),
      },
    });
  } catch (error) {
    console.error("[api/project-files] failed to read file:", error);
    return NextResponse.json({ error: "File unavailable" }, { status: 404 });
  }
}
