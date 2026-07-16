"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canViewArticle, isPrivilegedRole } from "./access";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

const commentSchema = z.object({ content: z.string().trim().min(1, "Write something first.").max(4000) });

/** Any active member of the article's organization who can view the article may comment on it — the same generic Comment model other doc-kinds in this app use (docKind: "KNOWLEDGE_ARTICLE"). */
export async function addKnowledgeArticleComment(articleId: string, content: string): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const parsed = commentSchema.safeParse({ content });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Write something first." };

  const membership = await prisma.membership.findFirst({ where: { userId, status: "ACTIVE" }, orderBy: { createdAt: "asc" } });
  if (!membership) return { ok: false, error: "You don't belong to an organization yet." };

  const article = await prisma.knowledgeArticle.findUnique({
    where: { id: articleId },
    include: { knowledgeBase: { include: { workspace: true } } },
  });
  if (!article || article.knowledgeBase.workspace.organizationId !== membership.organizationId) {
    return { ok: false, error: "Article not found." };
  }
  if (!canViewArticle(article, userId, isPrivilegedRole(membership.role))) {
    return { ok: false, error: "You don't have access to this article." };
  }

  try {
    await prisma.comment.create({
      data: {
        organizationId: membership.organizationId,
        docKind: "KNOWLEDGE_ARTICLE",
        docId: articleId,
        authorUserId: userId,
        content: parsed.data.content,
        mentionedUserIds: [],
      },
    });

    revalidatePath(`/dashboard/knowledge-base/${articleId}`);
    return { ok: true };
  } catch (error) {
    console.error("[knowledge-base] addKnowledgeArticleComment failed:", error);
    return { ok: false, error: "Something went wrong posting your comment. Please try again." };
  }
}
