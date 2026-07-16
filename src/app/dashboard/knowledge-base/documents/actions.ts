"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { saveRagDocumentFile, deleteRagDocumentFile } from "@/lib/storage/rag-documents";
import { enqueueDocumentIngestion } from "@/lib/rag/embedding-queue";
import { SUPPORTED_INGESTION_EXTENSIONS } from "@/lib/rag/ingestion";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

const EDITOR_ROLES = new Set(["OWNER", "ADMIN"]);
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const LIST_PATH = "/dashboard/knowledge-base/documents";

async function requireEditableMembership(userId: string) {
  const membership = await prisma.membership.findFirst({
    where: { userId, status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
  });
  if (!membership) return { ok: false as const, error: "You don't belong to an organization yet." };
  if (!EDITOR_ROLES.has(membership.role)) {
    return { ok: false as const, error: "Only owners and admins can manage ingested documents." };
  }
  return { ok: true as const, membership };
}

function extFromFilename(filename: string): string {
  const match = /\.([a-zA-Z0-9]+)$/.exec(filename);
  return match ? match[1].toLowerCase() : "";
}

/** Real multipart upload — accepts native FormData from a <form> posting a File + title, saves it to disk, creates the IngestedDocument row, and kicks off real background parse→chunk→embed processing. */
export async function uploadDocumentAction(formData: FormData): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const check = await requireEditableMembership(userId);
  if (!check.ok) return { ok: false, error: check.error };
  const { membership } = check;
  const organizationId = membership.organizationId;

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choose a file to upload." };
  }
  if (file.size > MAX_FILE_BYTES) {
    return { ok: false, error: "Files must be 25MB or smaller." };
  }

  const ext = extFromFilename(file.name);
  if (!SUPPORTED_INGESTION_EXTENSIONS.includes(ext)) {
    return {
      ok: false,
      error: `Unsupported file type ".${ext || "unknown"}". Supported: ${SUPPORTED_INGESTION_EXTENSIONS.join(", ")}.`,
    };
  }

  const title = String(formData.get("title") ?? "").trim() || file.name;

  try {
    const document = await prisma.ingestedDocument.create({
      data: {
        organizationId,
        title,
        sourceKind: "UPLOAD",
        status: "PENDING",
        originalFilename: file.name,
        mimeType: file.type || "application/octet-stream",
        storageKey: "",
        uploadedByUserId: userId,
      },
    });

    const buffer = Buffer.from(await file.arrayBuffer());
    const storageKey = await saveRagDocumentFile(organizationId, document.id, file.name, buffer);
    await prisma.ingestedDocument.update({ where: { id: document.id }, data: { storageKey } });

    await enqueueDocumentIngestion(organizationId, document.id);

    await logAudit({
      userId,
      organizationId,
      action: "rag_documents.uploaded",
      metadata: { ingestedDocumentId: document.id, filename: file.name },
    });

    revalidatePath(LIST_PATH);
    return { ok: true };
  } catch (error) {
    console.error("[knowledge-base/documents] uploadDocumentAction failed:", error);
    return { ok: false, error: "Something went wrong uploading the file. Please try again." };
  }
}

/** Org-scoped delete — removes the on-disk file, any Embedding rows for its chunks (Embedding.sourceId is a plain string, not a real FK, so it does NOT cascade-delete), then the IngestedDocument row itself (DocumentChunk rows cascade per schema). */
export async function deleteDocumentAction(id: string): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const check = await requireEditableMembership(userId);
  if (!check.ok) return { ok: false, error: check.error };
  const { membership } = check;

  try {
    const document = await prisma.ingestedDocument.findUnique({
      where: { id },
      include: { chunks: { select: { id: true } } },
    });
    if (!document || document.organizationId !== membership.organizationId) {
      return { ok: false, error: "Document not found." };
    }

    const chunkIds = document.chunks.map((c) => c.id);
    if (chunkIds.length > 0) {
      await prisma.embedding.deleteMany({ where: { sourceType: "DOCUMENT_CHUNK", sourceId: { in: chunkIds } } });
    }

    if (document.storageKey) {
      await deleteRagDocumentFile(document.storageKey);
    }
    await prisma.ingestedDocument.delete({ where: { id } });

    await logAudit({
      userId,
      organizationId: membership.organizationId,
      action: "rag_documents.deleted",
      metadata: { ingestedDocumentId: id },
    });

    revalidatePath(LIST_PATH);
    return { ok: true };
  } catch (error) {
    console.error("[knowledge-base/documents] deleteDocumentAction failed:", error);
    return { ok: false, error: "Something went wrong deleting this document. Please try again." };
  }
}

/** Org-scoped reprocess — resets a FAILED (or any) document back to PENDING and re-enqueues real background ingestion. */
export async function reprocessDocumentAction(id: string): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const check = await requireEditableMembership(userId);
  if (!check.ok) return { ok: false, error: check.error };
  const { membership } = check;

  try {
    const document = await prisma.ingestedDocument.findUnique({ where: { id } });
    if (!document || document.organizationId !== membership.organizationId) {
      return { ok: false, error: "Document not found." };
    }
    if (!document.storageKey || !document.mimeType) {
      return { ok: false, error: "This document has no stored file to reprocess." };
    }

    await prisma.ingestedDocument.update({ where: { id }, data: { status: "PENDING", error: null } });
    await enqueueDocumentIngestion(membership.organizationId, id);

    await logAudit({
      userId,
      organizationId: membership.organizationId,
      action: "rag_documents.reprocessed",
      metadata: { ingestedDocumentId: id },
    });

    revalidatePath(LIST_PATH);
    revalidatePath(`${LIST_PATH}/${id}`);
    return { ok: true };
  } catch (error) {
    console.error("[knowledge-base/documents] reprocessDocumentAction failed:", error);
    return { ok: false, error: "Something went wrong reprocessing this document. Please try again." };
  }
}
