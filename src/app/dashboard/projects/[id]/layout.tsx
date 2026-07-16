import { notFound } from "next/navigation";

import { Container } from "@/components/ui/container";
import { prisma } from "@/lib/prisma";
import { requireActiveMembership } from "@/app/dashboard/_lib/require-membership";
import { ProjectNav } from "./_components/project-nav";

/** Shared chrome for every /dashboard/projects/[id]/* route — same sticky sub-nav pattern as the Proposal hub's layout.tsx. */
export default async function ProjectLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { membership } = await requireActiveMembership(`/dashboard/projects/${id}`);

  const project = await prisma.project.findUnique({ where: { id }, select: { id: true, organizationId: true } });
  if (!project || project.organizationId !== membership.organizationId) notFound();

  return (
    <div className="flex flex-col">
      <div className="sticky top-16 z-20 border-b border-border bg-background/80 backdrop-blur">
        <Container>
          <ProjectNav projectId={id} />
        </Container>
      </div>
      {children}
    </div>
  );
}
