import Link from "next/link";
import { Library, FolderTree, FileStack, Share2 } from "lucide-react";

import { Container } from "@/components/ui/container";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { prisma } from "@/lib/prisma";
import { requireActiveMembership } from "../_lib/require-membership";
import { articleVisibilityWhere, isPrivilegedRole } from "./_lib/access";
import { ArticleForm } from "./_components/article-form";
import type { Prisma } from "@/generated/prisma/client";

const STATUS_OPTIONS = ["DRAFT", "PENDING_REVIEW", "PUBLISHED", "ARCHIVED"] as const;

export default async function KnowledgeBasePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status: statusFilter } = await searchParams;
  const { userId, membership } = await requireActiveMembership("/dashboard/knowledge-base");
  const organizationId = membership.organizationId;
  const privileged = isPrivilegedRole(membership.role);

  const workspace = await prisma.workspace.findUnique({ where: { organizationId } });

  const statusWhere: Prisma.KnowledgeArticleWhereInput =
    privileged && statusFilter && STATUS_OPTIONS.includes(statusFilter as (typeof STATUS_OPTIONS)[number])
      ? { status: statusFilter as (typeof STATUS_OPTIONS)[number] }
      : {};

  const [articles, categories, tags] = await Promise.all([
    workspace
      ? prisma.knowledgeArticle.findMany({
          where: {
            knowledgeBase: { workspaceId: workspace.id },
            ...articleVisibilityWhere(userId, privileged),
            ...statusWhere,
          },
          orderBy: { updatedAt: "desc" },
          include: { category: true, tagEntities: true },
        })
      : [],
    prisma.knowledgeCategory.findMany({ where: { organizationId }, orderBy: { name: "asc" } }),
    prisma.knowledgeTag.findMany({ where: { organizationId }, orderBy: { name: "asc" } }),
  ]);

  return (
    <main className="py-8">
      <Container className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Knowledge Base</h1>
            <p className="text-sm text-muted-foreground">
              Real, searchable articles for your organization — process docs, playbooks, and reference material
              your team and AI agents can both draw on.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/dashboard/knowledge-base/categories"
              className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <FolderTree className="size-4" /> Categories
            </Link>
            <Link
              href="/dashboard/knowledge-base/documents"
              className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <FileStack className="size-4" /> Documents
            </Link>
            <Link
              href="/dashboard/knowledge-base/graph"
              className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <Share2 className="size-4" /> Knowledge Graph
            </Link>
            <ArticleForm
              categories={categories.map((c) => ({ id: c.id, name: c.name }))}
              tagSuggestions={tags.map((t) => t.name)}
              canPublishOrg={privileged}
            />
          </div>
        </div>

        {privileged && (
          <form className="flex items-center gap-2" action="/dashboard/knowledge-base" method="GET">
            <label htmlFor="status-filter" className="text-sm text-muted-foreground">
              Status
            </label>
            <Select id="status-filter" name="status" defaultValue={statusFilter ?? ""} className="w-48">
              <option value="">All statuses</option>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
            <button
              type="submit"
              className="rounded-lg border border-border bg-transparent px-3.5 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-accent"
            >
              Apply
            </button>
          </form>
        )}

        {articles.length === 0 ? (
          <Card glass>
            <CardContent className="flex flex-col items-center gap-3 p-12 text-center">
              <Library className="size-8 text-muted-foreground" strokeWidth={1.5} />
              <p className="text-sm text-muted-foreground">No articles yet. Write your first one.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {articles.map((article) => (
              <Link key={article.id} href={`/dashboard/knowledge-base/${article.id}`}>
                <Card glass className="h-full transition-transform duration-150 hover:-translate-y-0.5">
                  <CardContent className="flex flex-col gap-2 p-5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium text-foreground">{article.title}</p>
                      {article.visibility === "PRIVATE" && (
                        <Badge variant="secondary">Private</Badge>
                      )}
                    </div>
                    <p className="line-clamp-3 text-sm text-muted-foreground">{article.content}</p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {(privileged || article.status !== "PUBLISHED") && (
                        <Badge variant="outline">{article.status}</Badge>
                      )}
                      {article.category && <Badge variant="accent">{article.category.name}</Badge>}
                      {article.tagEntities.slice(0, 3).map((tag) => (
                        <Badge key={tag.id} variant="outline">
                          {tag.name}
                        </Badge>
                      ))}
                      {article.tags.slice(0, 2).map((tag) => (
                        <Badge key={tag} variant="secondary">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </Container>
    </main>
  );
}
