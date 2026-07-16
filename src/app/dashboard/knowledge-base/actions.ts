"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { logAudit } from "@/lib/audit";
import { slugify } from "@/lib/slug";
import { enqueueSourceEmbedding } from "@/lib/rag/embedding-queue";
import { deleteEmbeddings } from "@/lib/rag/vector-store";
import { deleteKnowledgeAttachmentFile } from "@/lib/storage/knowledge-attachments";
import { knowledgeArticleSchema, type KnowledgeArticleInput } from "@/lib/validations/knowledge-article";
import { canEditArticle, isPrivilegedRole } from "./_lib/access";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

export interface CreateArticleResult extends ActionResult {
  articleId?: string;
}

async function resolveMembershipAndKnowledgeBase(userId: string) {
  const membership = await prisma.membership.findFirst({
    where: { userId, status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
  });
  if (!membership) return null;

  let workspace = await prisma.workspace.findUnique({
    where: { organizationId: membership.organizationId },
    include: { knowledgeBase: true },
  });
  if (workspace && !workspace.knowledgeBase) {
    const knowledgeBase = await prisma.knowledgeBase.create({ data: { workspaceId: workspace.id } });
    workspace = { ...workspace, knowledgeBase };
  }
  if (!workspace?.knowledgeBase) return null;

  return { membership, knowledgeBaseId: workspace.knowledgeBase.id };
}

/** Upserts a KnowledgeTag row per name (by organization-scoped slug) and returns their ids, for connecting to an article's `tagEntities`. */
async function resolveTagEntities(organizationId: string, names: string[]): Promise<string[]> {
  const unique = Array.from(new Set(names.map((n) => n.trim()).filter(Boolean)));
  const ids: string[] = [];
  for (const name of unique) {
    const slug = slugify(name);
    const tag = await prisma.knowledgeTag.upsert({
      where: { organizationId_slug: { organizationId, slug } },
      update: {},
      create: { organizationId, name, slug },
    });
    ids.push(tag.id);
  }
  return ids;
}

async function resolveCategory(organizationId: string, categoryId: string | null): Promise<string | null> {
  if (!categoryId) return null;
  const category = await prisma.knowledgeCategory.findUnique({ where: { id: categoryId } });
  if (!category || category.organizationId !== organizationId) return null;
  return category.id;
}

function embeddingText(title: string, content: string): string {
  return `${title}\n\n${content}`;
}

export async function createArticle(input: KnowledgeArticleInput): Promise<CreateArticleResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const parsed = knowledgeArticleSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the article." };
  }

  const resolved = await resolveMembershipAndKnowledgeBase(userId);
  if (!resolved) return { ok: false, error: "You don't belong to an organization yet." };
  const { membership, knowledgeBaseId } = resolved;
  const organizationId = membership.organizationId;
  const privileged = isPrivilegedRole(membership.role);

  // Only OWNER/ADMIN can publish organization-wide content; any active
  // member can still create a PRIVATE note-to-self article.
  if (parsed.data.visibility === "ORG" && !privileged) {
    return { ok: false, error: "Only owners and admins can create organization-visible articles. Save it as Private instead." };
  }

  try {
    const categoryId = await resolveCategory(organizationId, parsed.data.categoryId);
    const tagEntityIds = await resolveTagEntities(organizationId, parsed.data.tagEntityNames);

    // New articles always start as DRAFT — see setArticleStatus for the
    // real DRAFT -> PENDING_REVIEW -> PUBLISHED -> ARCHIVED workflow.
    const article = await prisma.knowledgeArticle.create({
      data: {
        knowledgeBaseId,
        title: parsed.data.title,
        content: parsed.data.content,
        tags: parsed.data.tags,
        createdByUserId: userId,
        kind: parsed.data.kind,
        visibility: parsed.data.visibility,
        status: "DRAFT",
        categoryId,
        tagEntities: { connect: tagEntityIds.map((id) => ({ id })) },
      },
    });

    await enqueueSourceEmbedding(organizationId, "KNOWLEDGE_ARTICLE", article.id, embeddingText(article.title, article.content));

    await logActivity({
      organizationId,
      type: "SYSTEM_EVENT",
      description: `${session.user?.name ?? "A team member"} added a Knowledge Base article: ${article.title}.`,
      actorUserId: userId,
      metadata: { articleId: article.id },
    });
    await logAudit({
      userId,
      organizationId,
      action: "knowledge_base.article_created",
      metadata: { articleId: article.id },
    });

    revalidatePath("/dashboard/knowledge-base");
    return { ok: true, articleId: article.id };
  } catch (error) {
    console.error("[knowledge-base] createArticle failed:", error);
    return { ok: false, error: "Something went wrong creating the article. Please try again." };
  }
}

export async function updateArticle(articleId: string, input: KnowledgeArticleInput): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const parsed = knowledgeArticleSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the article." };
  }

  const resolved = await resolveMembershipAndKnowledgeBase(userId);
  if (!resolved) return { ok: false, error: "You don't belong to an organization yet." };
  const { membership, knowledgeBaseId } = resolved;
  const organizationId = membership.organizationId;
  const privileged = isPrivilegedRole(membership.role);

  try {
    const existing = await prisma.knowledgeArticle.findUnique({ where: { id: articleId } });
    if (!existing || existing.knowledgeBaseId !== knowledgeBaseId) {
      return { ok: false, error: "Article not found." };
    }
    if (!canEditArticle(existing, userId, privileged)) {
      return { ok: false, error: "Only the article's author, or an owner/admin, can edit it." };
    }
    if (parsed.data.visibility === "ORG" && existing.visibility !== "ORG" && !privileged) {
      return { ok: false, error: "Only owners and admins can publish an article organization-wide." };
    }

    const categoryId = await resolveCategory(organizationId, parsed.data.categoryId);
    const tagEntityIds = await resolveTagEntities(organizationId, parsed.data.tagEntityNames);

    const contentChanged = existing.title !== parsed.data.title || existing.content !== parsed.data.content;
    if (contentChanged) {
      // Snapshot the PRE-update state before overwriting it.
      await prisma.knowledgeArticleVersion.create({
        data: {
          articleId,
          title: existing.title,
          content: existing.content,
          editedByUserId: userId,
        },
      });
    }

    await prisma.knowledgeArticle.update({
      where: { id: articleId },
      data: {
        title: parsed.data.title,
        content: parsed.data.content,
        tags: parsed.data.tags,
        kind: parsed.data.kind,
        visibility: parsed.data.visibility,
        categoryId,
        tagEntities: { set: tagEntityIds.map((id) => ({ id })) },
      },
    });

    if (contentChanged) {
      await enqueueSourceEmbedding(organizationId, "KNOWLEDGE_ARTICLE", articleId, embeddingText(parsed.data.title, parsed.data.content));
    }

    await logAudit({
      userId,
      organizationId,
      action: "knowledge_base.article_updated",
      metadata: { articleId },
    });

    revalidatePath("/dashboard/knowledge-base");
    revalidatePath(`/dashboard/knowledge-base/${articleId}`);
    return { ok: true };
  } catch (error) {
    console.error("[knowledge-base] updateArticle failed:", error);
    return { ok: false, error: "Something went wrong saving the article. Please try again." };
  }
}

export async function deleteArticle(articleId: string): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const resolved = await resolveMembershipAndKnowledgeBase(userId);
  if (!resolved) return { ok: false, error: "You don't belong to an organization yet." };
  const { membership, knowledgeBaseId } = resolved;
  const organizationId = membership.organizationId;
  const privileged = isPrivilegedRole(membership.role);

  try {
    const existing = await prisma.knowledgeArticle.findUnique({
      where: { id: articleId },
      include: { attachments: true },
    });
    if (!existing || existing.knowledgeBaseId !== knowledgeBaseId) {
      return { ok: false, error: "Article not found." };
    }
    if (!canEditArticle(existing, userId, privileged)) {
      return { ok: false, error: "Only the article's author, or an owner/admin, can delete it." };
    }

    await prisma.knowledgeArticle.delete({ where: { id: articleId } });
    await Promise.all(existing.attachments.map((a) => deleteKnowledgeAttachmentFile(a.storageKey)));
    await deleteEmbeddings("KNOWLEDGE_ARTICLE", articleId);

    await logAudit({
      userId,
      organizationId,
      action: "knowledge_base.article_deleted",
      metadata: { articleId },
    });

    revalidatePath("/dashboard/knowledge-base");
    return { ok: true };
  } catch (error) {
    console.error("[knowledge-base] deleteArticle failed:", error);
    return { ok: false, error: "Something went wrong deleting the article. Please try again." };
  }
}

const STATUS_VALUES = ["DRAFT", "PENDING_REVIEW", "PUBLISHED", "ARCHIVED"] as const;
type ArticleStatus = (typeof STATUS_VALUES)[number];

/**
 * Lightweight publish workflow: DRAFT -> PENDING_REVIEW -> PUBLISHED -> ARCHIVED.
 * The article's author (or an OWNER/ADMIN) can submit for review, withdraw,
 * or archive; only an OWNER/ADMIN can move PENDING_REVIEW -> PUBLISHED,
 * which stamps reviewedByUserId/reviewedAt. Any other jump (e.g. straight
 * from DRAFT to PUBLISHED) is rejected — that's the point of having a real
 * review step rather than a free-form status setter.
 */
const ALLOWED_TRANSITIONS: Record<ArticleStatus, ArticleStatus[]> = {
  DRAFT: ["PENDING_REVIEW", "ARCHIVED"],
  PENDING_REVIEW: ["DRAFT", "PUBLISHED", "ARCHIVED"],
  PUBLISHED: ["ARCHIVED"],
  ARCHIVED: ["DRAFT"],
};

export async function setArticleStatus(articleId: string, nextStatus: ArticleStatus): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  if (!STATUS_VALUES.includes(nextStatus)) return { ok: false, error: "Invalid status." };

  const resolved = await resolveMembershipAndKnowledgeBase(userId);
  if (!resolved) return { ok: false, error: "You don't belong to an organization yet." };
  const { membership, knowledgeBaseId } = resolved;
  const organizationId = membership.organizationId;
  const privileged = isPrivilegedRole(membership.role);

  try {
    const existing = await prisma.knowledgeArticle.findUnique({ where: { id: articleId } });
    if (!existing || existing.knowledgeBaseId !== knowledgeBaseId) {
      return { ok: false, error: "Article not found." };
    }
    if (!canEditArticle(existing, userId, privileged)) {
      return { ok: false, error: "Only the article's author, or an owner/admin, can change its status." };
    }

    const allowed = ALLOWED_TRANSITIONS[existing.status as ArticleStatus] ?? [];
    if (!allowed.includes(nextStatus)) {
      return { ok: false, error: `Can't move an article from ${existing.status} to ${nextStatus} directly.` };
    }
    if (nextStatus === "PUBLISHED" && !privileged) {
      return { ok: false, error: "Only owners and admins can publish an article." };
    }

    await prisma.knowledgeArticle.update({
      where: { id: articleId },
      data: {
        status: nextStatus,
        ...(nextStatus === "PUBLISHED" ? { reviewedByUserId: userId, reviewedAt: new Date() } : {}),
      },
    });

    await logActivity({
      organizationId,
      type: "SYSTEM_EVENT",
      description: `${session.user?.name ?? "A team member"} moved Knowledge Base article "${existing.title}" to ${nextStatus}.`,
      actorUserId: userId,
      metadata: { articleId, status: nextStatus },
    });
    await logAudit({
      userId,
      organizationId,
      action: "knowledge_base.article_status_changed",
      metadata: { articleId, from: existing.status, to: nextStatus },
    });

    revalidatePath("/dashboard/knowledge-base");
    revalidatePath(`/dashboard/knowledge-base/${articleId}`);
    return { ok: true };
  } catch (error) {
    console.error("[knowledge-base] setArticleStatus failed:", error);
    return { ok: false, error: "Something went wrong updating the article's status." };
  }
}

/** Restores an article's title/content from a prior KnowledgeArticleVersion snapshot — OWNER/ADMIN only. The current state is itself snapshotted first, so a restore is never destructive. */
export async function restoreArticleVersion(articleId: string, versionId: string): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const resolved = await resolveMembershipAndKnowledgeBase(userId);
  if (!resolved) return { ok: false, error: "You don't belong to an organization yet." };
  const { membership, knowledgeBaseId } = resolved;
  const organizationId = membership.organizationId;

  if (!isPrivilegedRole(membership.role)) {
    return { ok: false, error: "Only owners and admins can restore a previous version." };
  }

  try {
    const existing = await prisma.knowledgeArticle.findUnique({ where: { id: articleId } });
    if (!existing || existing.knowledgeBaseId !== knowledgeBaseId) {
      return { ok: false, error: "Article not found." };
    }
    const version = await prisma.knowledgeArticleVersion.findUnique({ where: { id: versionId } });
    if (!version || version.articleId !== articleId) {
      return { ok: false, error: "Version not found." };
    }

    await prisma.knowledgeArticleVersion.create({
      data: { articleId, title: existing.title, content: existing.content, editedByUserId: userId },
    });
    await prisma.knowledgeArticle.update({
      where: { id: articleId },
      data: { title: version.title, content: version.content },
    });

    await enqueueSourceEmbedding(organizationId, "KNOWLEDGE_ARTICLE", articleId, embeddingText(version.title, version.content));

    await logAudit({
      userId,
      organizationId,
      action: "knowledge_base.article_version_restored",
      metadata: { articleId, versionId },
    });

    revalidatePath(`/dashboard/knowledge-base/${articleId}`);
    return { ok: true };
  } catch (error) {
    console.error("[knowledge-base] restoreArticleVersion failed:", error);
    return { ok: false, error: "Something went wrong restoring that version." };
  }
}
