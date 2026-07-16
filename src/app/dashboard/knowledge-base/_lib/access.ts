/**
 * Shared Knowledge Base access-control helpers — used by the article list
 * query, the article detail page's access check, the tag-browse page, and
 * the attachment download route, so the PRIVATE-visibility and
 * non-PUBLISHED-status rules are defined exactly once.
 */

import type { Prisma } from "@/generated/prisma/client";

export const PRIVILEGED_ROLES = new Set(["OWNER", "ADMIN"]);

export function isPrivilegedRole(role: string): boolean {
  return PRIVILEGED_ROLES.has(role);
}

export interface ArticleAccessFields {
  visibility: string;
  status: string;
  createdByUserId: string | null;
}

/** Whether `userId` may read this article at all (detail page, attachment downloads, comments). */
export function canViewArticle(article: ArticleAccessFields, userId: string, privileged: boolean): boolean {
  if (privileged) return true;
  if (article.visibility === "PRIVATE" && article.createdByUserId !== userId) return false;
  if (article.status !== "PUBLISHED" && article.createdByUserId !== userId) return false;
  return true;
}

/** Whether `userId` may edit/delete/manage attachments on this article. */
export function canEditArticle(article: Pick<ArticleAccessFields, "createdByUserId">, userId: string, privileged: boolean): boolean {
  return privileged || article.createdByUserId === userId;
}

/**
 * The same visibility/status rules as `canViewArticle`, expressed as a
 * Prisma where-fragment for list-style queries (article list, tag browse
 * page) — a privileged viewer gets no extra restriction; anyone else only
 * sees PUBLISHED+ORG articles from other authors, plus all of their own
 * regardless of status/visibility.
 */
export function articleVisibilityWhere(userId: string, privileged: boolean): Prisma.KnowledgeArticleWhereInput {
  if (privileged) return {};
  return {
    OR: [
      { createdByUserId: userId },
      { AND: [{ visibility: "ORG" }, { status: "PUBLISHED" }] },
    ],
  };
}
