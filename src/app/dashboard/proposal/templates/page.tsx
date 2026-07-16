import { Container } from "@/components/ui/container";
import { prisma } from "@/lib/prisma";
import { requireActiveMembership } from "../../_lib/require-membership";
import { TemplateForm } from "./_components/template-form";
import { TemplateList } from "./_components/template-list";

export default async function TemplatesPage() {
  const { membership } = await requireActiveMembership("/dashboard/proposal/templates");

  const templates = await prisma.documentTemplate.findMany({
    where: { organizationId: membership.organizationId },
    orderBy: { createdAt: "desc" },
  });

  return (
    <main className="py-8">
      <Container className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Templates</h1>
            <p className="text-sm text-muted-foreground">Reusable content templates — modular building blocks shared across Proposals, Quotations, Contracts, Invoices, and Legal &amp; Project Docs.</p>
          </div>
          <TemplateForm />
        </div>

        <TemplateList templates={templates.map((t) => ({ id: t.id, name: t.name, docKind: t.docKind, category: t.category, isDefault: t.isDefault }))} />
      </Container>
    </main>
  );
}
