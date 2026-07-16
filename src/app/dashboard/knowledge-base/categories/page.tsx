import Link from "next/link";
import { ArrowLeft, FolderTree } from "lucide-react";

import { Container } from "@/components/ui/container";
import { Card, CardContent } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import { requireActiveMembership } from "@/app/dashboard/_lib/require-membership";
import { isPrivilegedRole } from "../_lib/access";
import { CategoryManager } from "./_components/category-manager";

export default async function KnowledgeCategoriesPage() {
  const { membership } = await requireActiveMembership("/dashboard/knowledge-base/categories");
  const organizationId = membership.organizationId;
  const canManage = isPrivilegedRole(membership.role);

  const categories = await prisma.knowledgeCategory.findMany({
    where: { organizationId },
    orderBy: { name: "asc" },
    include: { _count: { select: { articles: true } } },
  });

  const rows = categories.map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    parentId: c.parentId,
    articleCount: c._count.articles,
  }));

  return (
    <main className="py-8">
      <Container className="flex max-w-3xl flex-col gap-6">
        <Link
          href="/dashboard/knowledge-base"
          className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Back to Knowledge Base
        </Link>

        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-foreground">
            <FolderTree className="size-6" /> Categories
          </h1>
          <p className="text-sm text-muted-foreground">
            Organize Knowledge Base articles into categories, with optional sub-categories.
          </p>
        </div>

        {rows.length === 0 && !canManage ? (
          <Card glass>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">No categories yet.</CardContent>
          </Card>
        ) : (
          <CategoryManager categories={rows} canManage={canManage} />
        )}
      </Container>
    </main>
  );
}
