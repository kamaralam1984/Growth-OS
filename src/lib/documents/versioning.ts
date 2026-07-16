import { prisma } from "@/lib/prisma";
import type { DocumentEngineKind } from "./blueprint";

/**
 * Append-only version history shared by every document kind — Draft →
 * Review → Approved → Rejected → Archived status changes and content
 * edits all get a snapshot here. Polymorphic (docKind + docId) for the
 * same reason DocumentVersion itself is (see prisma/schema.prisma).
 */
export async function createDocumentVersion(params: {
  organizationId: string;
  docKind: DocumentEngineKind;
  docId: string;
  title: string;
  content: string;
  changedByUserId?: string | null;
  changeNote?: string | null;
}): Promise<void> {
  try {
    const last = await prisma.documentVersion.findFirst({
      where: { docKind: params.docKind, docId: params.docId },
      orderBy: { versionNumber: "desc" },
      select: { versionNumber: true },
    });
    await prisma.documentVersion.create({
      data: {
        organizationId: params.organizationId,
        docKind: params.docKind,
        docId: params.docId,
        versionNumber: (last?.versionNumber ?? 0) + 1,
        snapshotTitle: params.title,
        snapshotContent: params.content,
        changedByUserId: params.changedByUserId ?? null,
        changeNote: params.changeNote ?? null,
      },
    });
  } catch (error) {
    console.error("[documents/versioning] createDocumentVersion failed:", error);
  }
}

export async function listDocumentVersions(docKind: DocumentEngineKind, docId: string) {
  return prisma.documentVersion.findMany({
    where: { docKind, docId },
    orderBy: { versionNumber: "desc" },
    include: { changedByUser: { select: { name: true, email: true } } },
  });
}
