"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { saveKnowledgeAttachment, deleteKnowledgeAttachmentFile } from "@/lib/storage/knowledge-attachments";
import { canEditArticle, isPrivilegedRole } from "./access";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

const MAX_FILE_BYTES = 25 * 1024 * 1024;

async function resolveArticleForEdit(userId: string, articleId: string) {
  const membership = await prisma.membership.findFirst({ where: { userId, status: "ACTIVE" }, orderBy: { createdAt: "asc" } });
  if (!membership) return { ok: false as const, error: "You don't belong to an organization yet." };

  const article = await prisma.knowledgeArticle.findUnique({
    where: { id: articleId },
    include: { knowledgeBase: { include: { workspace: true } } },
  });
  if (!article || article.knowledgeBase.workspace.organizationId !== membership.organizationId) {
    return { ok: false as const, error: "Article not found." };
  }

  const privileged = isPrivilegedRole(membership.role);
  if (!canEditArticle(article, userId, privileged)) {
    return { ok: false as const, error: "Only the article's author, or an owner/admin, can manage its attachments." };
  }

  return { ok: true as const, membership, article };
}

/** Real multipart upload — accepts native FormData from a <form> posting a File, saves it to disk, and creates the KnowledgeAttachment row. */
export async function uploadKnowledgeAttachment(articleId: string, formData: FormData): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const resolved = await resolveArticleForEdit(userId, articleId);
  if (!resolved.ok) return { ok: false, error: resolved.error };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choose a file to upload." };
  }
  if (file.size > MAX_FILE_BYTES) {
    return { ok: false, error: "Files must be 25MB or smaller." };
  }

  try {
    const attachment = await prisma.knowledgeAttachment.create({
      data: {
        articleId,
        filename: file.name,
        storageKey: "",
        mimeType: file.type || "application/octet-stream",
        sizeBytes: file.size,
        uploadedByUserId: userId,
      },
    });

    const buffer = Buffer.from(await file.arrayBuffer());
    const storageKey = await saveKnowledgeAttachment(articleId, attachment.id, file.name, buffer);
    await prisma.knowledgeAttachment.update({ where: { id: attachment.id }, data: { storageKey } });

    await logAudit({
      userId,
      organizationId: resolved.membership.organizationId,
      action: "knowledge_base.attachment_uploaded",
      metadata: { articleId, attachmentId: attachment.id, filename: file.name },
    });

    revalidatePath(`/dashboard/knowledge-base/${articleId}`);
    return { ok: true };
  } catch (error) {
    console.error("[knowledge-base] uploadKnowledgeAttachment failed:", error);
    return { ok: false, error: "Something went wrong uploading the file. Please try again." };
  }
}

export async function deleteKnowledgeAttachment(articleId: string, attachmentId: string): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const resolved = await resolveArticleForEdit(userId, articleId);
  if (!resolved.ok) return { ok: false, error: resolved.error };

  try {
    const attachment = await prisma.knowledgeAttachment.findUnique({ where: { id: attachmentId } });
    if (!attachment || attachment.articleId !== articleId) {
      return { ok: false, error: "Attachment not found." };
    }

    await prisma.knowledgeAttachment.delete({ where: { id: attachmentId } });
    await deleteKnowledgeAttachmentFile(attachment.storageKey);

    await logAudit({
      userId,
      organizationId: resolved.membership.organizationId,
      action: "knowledge_base.attachment_deleted",
      metadata: { articleId, attachmentId },
    });

    revalidatePath(`/dashboard/knowledge-base/${articleId}`);
    return { ok: true };
  } catch (error) {
    console.error("[knowledge-base] deleteKnowledgeAttachment failed:", error);
    return { ok: false, error: "Something went wrong deleting the attachment. Please try again." };
  }
}
