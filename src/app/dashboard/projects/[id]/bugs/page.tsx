import { notFound } from "next/navigation";

import { Container } from "@/components/ui/container";
import { prisma } from "@/lib/prisma";
import { requireActiveMembership } from "@/app/dashboard/_lib/require-membership";
import { BugList, type BugReportRow } from "./_components/bug-list";

export default async function ProjectBugsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { membership } = await requireActiveMembership(`/dashboard/projects/${id}/bugs`);

  const project = await prisma.project.findUnique({ where: { id }, select: { id: true, name: true, organizationId: true } });
  if (!project || project.organizationId !== membership.organizationId) notFound();

  const bugReports = await prisma.bugReport.findMany({
    where: { projectId: id },
    orderBy: [{ status: "asc" }, { severity: "desc" }, { createdAt: "desc" }],
    include: { task: { select: { id: true, status: true } } },
  });

  const rows: BugReportRow[] = bugReports.map((b) => ({
    id: b.id,
    title: b.title,
    description: b.description,
    severity: b.severity,
    status: b.status,
    reproSteps: b.reproSteps,
    environment: b.environment,
    createdAt: b.createdAt.toISOString(),
    task: b.task ? { id: b.task.id, status: b.task.status } : null,
  }));

  return (
    <main className="py-8">
      <Container className="flex max-w-4xl flex-col gap-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">{project.name} — Bugs</h1>
          <p className="text-sm text-muted-foreground">Real, dedicated QA bug tracking — severity, repro steps, and environment, promotable to a real Task once triaged.</p>
        </div>
        <BugList projectId={id} bugReports={rows} />
      </Container>
    </main>
  );
}
