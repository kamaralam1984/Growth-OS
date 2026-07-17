import { prisma } from "@/lib/prisma";
import type { KnowledgePackManifest } from "../manifest-schema";

export interface KnowledgePackInstallResult {
  knowledgeArticleIds: string[];
}

/** Get-or-create the org's single Workspace-scoped KnowledgeBase — same lazy pattern as resolveMembershipAndKnowledgeBase() in knowledge-base/actions.ts. */
async function getOrCreateKnowledgeBaseId(organizationId: string): Promise<string> {
  const workspace = await prisma.workspace.findUniqueOrThrow({
    where: { organizationId },
    include: { knowledgeBase: true },
  });
  if (workspace.knowledgeBase) return workspace.knowledgeBase.id;
  const knowledgeBase = await prisma.knowledgeBase.create({ data: { workspaceId: workspace.id } });
  return knowledgeBase.id;
}

/**
 * Creates real KnowledgeArticle rows — the same create shape createArticle()
 * (src/app/dashboard/knowledge-base/actions.ts) uses, and literally the same
 * pattern OrganizationDNA.draftConfiguration.knowledgeArticles already
 * applies via auto-configure.ts. Articles land as DRAFT, org-visible, so a
 * human reviews before publishing — never auto-published.
 */
export async function installKnowledgePack(organizationId: string, manifest: KnowledgePackManifest, createdByUserId: string): Promise<KnowledgePackInstallResult> {
  const knowledgeBaseId = await getOrCreateKnowledgeBaseId(organizationId);

  const created = await prisma.$transaction(
    manifest.articles.map((article) =>
      prisma.knowledgeArticle.create({
        data: {
          knowledgeBaseId,
          title: article.title,
          content: article.content,
          tags: article.tags,
          createdByUserId,
          kind: "ARTICLE",
          visibility: "ORG",
          status: "DRAFT",
        },
      }),
    ),
  );

  return { knowledgeArticleIds: created.map((a) => a.id) };
}

export async function uninstallKnowledgePack(knowledgeArticleIds: string[]): Promise<void> {
  await prisma.knowledgeArticle.deleteMany({ where: { id: { in: knowledgeArticleIds } } });
}
