import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { Container } from "@/components/ui/container";
import { prisma } from "@/lib/prisma";
import { requireActiveMembership } from "@/app/dashboard/_lib/require-membership";
import { canEditArticle, canViewArticle, isPrivilegedRole } from "../_lib/access";
import { ArticleEditor } from "../_components/article-editor";
import type { ArticleKind, ArticleVisibility } from "../_components/article-meta-fields";

export default async function ArticleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { userId, membership } = await requireActiveMembership(`/dashboard/knowledge-base/${id}`);
  const organizationId = membership.organizationId;
  const privileged = isPrivilegedRole(membership.role);

  const article = await prisma.knowledgeArticle.findUnique({
    where: { id },
    include: {
      knowledgeBase: { include: { workspace: true } },
      category: true,
      tagEntities: true,
      versions: { orderBy: { createdAt: "desc" }, include: { editedByUser: { select: { name: true } } } },
      attachments: { orderBy: { createdAt: "desc" }, include: { uploadedByUser: { select: { name: true } } } },
    },
  });

  if (!article || article.knowledgeBase.workspace.organizationId !== organizationId) {
    notFound();
  }
  if (!canViewArticle(article, userId, privileged)) {
    notFound();
  }

  const comments = await prisma.comment.findMany({
    where: { organizationId, docKind: "KNOWLEDGE_ARTICLE", docId: id },
    orderBy: { createdAt: "asc" },
    include: { authorUser: { select: { name: true } } },
  });

  const categories = await prisma.knowledgeCategory.findMany({ where: { organizationId }, orderBy: { name: "asc" } });
  const tags = await prisma.knowledgeTag.findMany({ where: { organizationId }, orderBy: { name: "asc" } });
  const reviewer = article.reviewedByUserId
    ? await prisma.user.findUnique({ where: { id: article.reviewedByUserId }, select: { name: true } })
    : null;

  const canEdit = canEditArticle(article, userId, privileged);

  return (
    <main className="py-8">
      <Container className="flex max-w-4xl flex-col gap-6">
        <Link
          href="/dashboard/knowledge-base"
          className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Back to Knowledge Base
        </Link>

        <ArticleEditor
          articleId={article.id}
          initialTitle={article.title}
          initialContent={article.content}
          initialTags={article.tags}
          initialTagEntityNames={article.tagEntities.map((t) => t.name)}
          initialKind={article.kind as ArticleKind}
          initialVisibility={article.visibility as ArticleVisibility}
          initialCategoryId={article.categoryId ?? ""}
          status={article.status}
          reviewedByName={reviewer?.name ?? null}
          reviewedAt={article.reviewedAt?.toISOString() ?? null}
          categories={categories.map((c) => ({ id: c.id, name: c.name }))}
          tagSuggestions={tags.map((t) => t.name)}
          canEdit={canEdit}
          canPublishOrg={privileged}
          versions={article.versions.map((v) => ({
            id: v.id,
            title: v.title,
            content: v.content,
            editedByName: v.editedByUser?.name ?? null,
            createdAt: v.createdAt.toISOString(),
          }))}
          attachments={article.attachments.map((a) => ({
            id: a.id,
            filename: a.filename,
            mimeType: a.mimeType,
            sizeBytes: a.sizeBytes,
            uploadedByName: a.uploadedByUser?.name ?? null,
            createdAt: a.createdAt.toISOString(),
          }))}
          comments={comments.map((c) => ({
            id: c.id,
            content: c.content,
            authorName: c.authorUser?.name ?? null,
            createdAt: c.createdAt.toISOString(),
          }))}
        />
      </Container>
    </main>
  );
}
