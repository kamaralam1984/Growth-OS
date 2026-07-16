import { notFound } from "next/navigation";

import { Container } from "@/components/ui/container";
import { prisma } from "@/lib/prisma";
import { requireActiveMembership } from "@/app/dashboard/_lib/require-membership";
import { computeProjectInsights } from "@/lib/projects/insights";
import { RiskList, type RiskRow } from "./_components/risk-list";
import { InsightsPanel } from "./_components/insights-panel";

export default async function ProjectRisksPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { membership } = await requireActiveMembership(`/dashboard/projects/${id}/risks`);

  const project = await prisma.project.findUnique({ where: { id }, select: { id: true, name: true, organizationId: true } });
  if (!project || project.organizationId !== membership.organizationId) notFound();

  const [risks, insights] = await Promise.all([
    prisma.projectRisk.findMany({ where: { projectId: id }, orderBy: [{ status: "asc" }, { severity: "desc" }, { createdAt: "desc" }] }),
    computeProjectInsights(id),
  ]);

  const rows: RiskRow[] = risks.map((r) => ({
    id: r.id,
    category: r.category,
    severity: r.severity,
    status: r.status,
    title: r.title,
    description: r.description,
    createdAt: r.createdAt.toISOString(),
    resolvedAt: r.resolvedAt ? r.resolvedAt.toISOString() : null,
  }));

  return (
    <main className="py-8">
      <Container className="flex flex-col gap-8">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">{project.name} — Risks &amp; Insights</h1>
          <p className="text-sm text-muted-foreground">Deterministic risk detection from real project data, plus AI-narrated insights — nothing here is fabricated.</p>
        </div>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-foreground">AI Insights</h2>
          <InsightsPanel insights={insights} />
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-foreground">Risk register</h2>
          <RiskList projectId={id} risks={rows} />
        </section>
      </Container>
    </main>
  );
}
