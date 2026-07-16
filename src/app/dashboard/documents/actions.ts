"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { logAudit } from "@/lib/audit";
import { saveDocumentFile, deleteDocumentFile } from "@/lib/storage/documents";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

const MAX_FILE_BYTES = 20 * 1024 * 1024;

async function resolveActiveMembership(userId: string) {
  return prisma.membership.findFirst({
    where: { userId, status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
  });
}

/** Real local-disk file upload — accepts native FormData from a <form action={uploadDocument}>. */
export async function uploadDocument(formData: FormData): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const membership = await resolveActiveMembership(userId);
  if (!membership) return { ok: false, error: "You don't belong to an organization yet." };
  const organizationId = membership.organizationId;

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choose a file to upload." };
  }
  if (file.size > MAX_FILE_BYTES) {
    return { ok: false, error: "Files must be 20MB or smaller." };
  }

  const folder = String(formData.get("folder") ?? "").trim() || null;
  const linkedCompanyId = String(formData.get("linkedCompanyId") ?? "").trim() || null;
  const linkedDealId = String(formData.get("linkedDealId") ?? "").trim() || null;

  if (linkedCompanyId) {
    const company = await prisma.company.findUnique({ where: { id: linkedCompanyId } });
    if (!company || company.organizationId !== organizationId) {
      return { ok: false, error: "Selected company was not found." };
    }
  }
  if (linkedDealId) {
    const deal = await prisma.deal.findUnique({ where: { id: linkedDealId } });
    if (!deal || deal.organizationId !== organizationId) {
      return { ok: false, error: "Selected deal was not found." };
    }
  }

  try {
    const document = await prisma.document.create({
      data: {
        organizationId,
        name: file.name,
        storageKey: "",
        mimeType: file.type || "application/octet-stream",
        sizeBytes: file.size,
        folder,
        linkedCompanyId,
        linkedDealId,
        uploadedByUserId: userId,
      },
    });

    const buffer = Buffer.from(await file.arrayBuffer());
    const storageKey = await saveDocumentFile(organizationId, document.id, file.name, buffer);
    await prisma.document.update({ where: { id: document.id }, data: { storageKey } });

    await logActivity({
      organizationId,
      type: "SYSTEM_EVENT",
      description: `${session.user?.name ?? "A team member"} uploaded "${document.name}".`,
      actorUserId: userId,
      metadata: { documentId: document.id },
    });
    await logAudit({ userId, organizationId, action: "documents.uploaded", metadata: { documentId: document.id } });

    revalidatePath("/dashboard/documents");
    if (linkedDealId) revalidatePath(`/dashboard/crm/deals/${linkedDealId}`);
    return { ok: true };
  } catch (error) {
    console.error("[documents] uploadDocument failed:", error);
    return { ok: false, error: "Something went wrong uploading the file. Please try again." };
  }
}

export async function deleteDocument(documentId: string): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const membership = await resolveActiveMembership(userId);
  if (!membership) return { ok: false, error: "You don't belong to an organization yet." };

  try {
    const document = await prisma.document.findUnique({ where: { id: documentId } });
    if (!document || document.organizationId !== membership.organizationId) {
      return { ok: false, error: "Document not found." };
    }

    await deleteDocumentFile(document.storageKey);
    await prisma.document.delete({ where: { id: documentId } });

    await logAudit({
      userId,
      organizationId: membership.organizationId,
      action: "documents.deleted",
      metadata: { documentId },
    });

    revalidatePath("/dashboard/documents");
    return { ok: true };
  } catch (error) {
    console.error("[documents] deleteDocument failed:", error);
    return { ok: false, error: "Something went wrong deleting the file. Please try again." };
  }
}
