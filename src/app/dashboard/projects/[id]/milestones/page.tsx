import { notFound } from "next/navigation";

import { Container } from "@/components/ui/container";
import { prisma } from "@/lib/prisma";
import { requireActiveMembership } from "@/app/dashboard/_lib/require-membership";
import { MilestoneList, type MilestoneRow } from "./_components/milestone-list";

export default async function ProjectMilestonesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { membership } = await requireActiveMembership(`/dashboard/projects/${id}/milestones`);
  const canManage = membership.role === "OWNER" || membership.role === "ADMIN";

  const project = await prisma.project.findUnique({ where: { id }, select: { id: true, name: true, organizationId: true } });
  if (!project || project.organizationId !== membership.organizationId) notFound();

  const milestones = await prisma.milestone.findMany({ where: { projectId: id }, orderBy: { order: "asc" } });

  const rows: MilestoneRow[] = milestones.map((m) => ({
    id: m.id,
    name: m.name,
    description: m.description,
    dueDate: m.dueDate ? m.dueDate.toISOString() : null,
    status: m.status,
    visibleToClient: m.visibleToClient,
    clientApprovedAt: m.clientApprovedAt ? m.clientApprovedAt.toISOString() : null,
    clientSatisfactionRating: m.clientSatisfactionRating,
  }));

  return (
    <main className="py-8">
      <Container className="flex max-w-3xl flex-col gap-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">{project.name} — Milestones</h1>
          <p className="text-sm text-muted-foreground">Real delivery milestones — visible-to-client ones show up in the Client Portal for approval.</p>
        </div>
        <MilestoneList projectId={id} milestones={rows} canManage={canManage} />
      </Container>
    </main>
  );
}
