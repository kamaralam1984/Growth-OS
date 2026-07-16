import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Tag as TagIcon } from "lucide-react";

import { Container } from "@/components/ui/container";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/prisma";
import { requireActiveMembership } from "@/app/dashboard/_lib/require-membership";
import { articleVisibilityWhere, isPrivilegedRole } from "../../_lib/access";

export default async function KnowledgeTagPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { userId, membership } = await requireActiveMembership(`/dashboard/knowledge-base/tags/${slug}`);
  const organizationId = membership.organizationId;
  const privileged = isPrivilegedRole(membership.role);

  const tag = await prisma.knowledgeTag.findUnique({ where: { organizationId_slug: { organizationId, slug } } });
  if (!tag) notFound();

  const articles = await prisma.knowledgeArticle.findMany({
    where: {
      tagEntities: { some: { id: tag.id } },
      knowledgeBase: { workspace: { organizationId } },
      ...articleVisibilityWhere(userId, privileged),
    },
    orderBy: { updatedAt: "desc" },
    include: { category: true },
  });

  return (
    <main className="py-8">
      <Container className="flex flex-col gap-6">
        <Link
          href="/dashboard/knowledge-base"
          className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Back to Knowledge Base
        </Link>

        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-foreground">
            <TagIcon className="size-6" /> {tag.name}
          </h1>
          <p className="text-sm text-muted-foreground">
            {articles.length} article{articles.length === 1 ? "" : "s"} tagged &ldquo;{tag.name}&rdquo;.
          </p>
        </div>

        {articles.length === 0 ? (
          <Card glass>
            <CardContent className="p-12 text-center text-sm text-muted-foreground">No articles with this tag yet.</CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {articles.map((article) => (
              <Link key={article.id} href={`/dashboard/knowledge-base/${article.id}`}>
                <Card glass className="h-full transition-transform duration-150 hover:-translate-y-0.5">
                  <CardContent className="flex flex-col gap-2 p-5">
                    <p className="font-medium text-foreground">{article.title}</p>
                    <p className="line-clamp-3 text-sm text-muted-foreground">{article.content}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      {article.category && <Badge variant="accent">{article.category.name}</Badge>}
                      <Badge variant="outline">{article.status}</Badge>
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
