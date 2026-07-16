import Link from "next/link";

import { Container } from "@/components/ui/container";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/prisma";
import { requireClientPortalSession } from "@/lib/client-portal/auth";

export default async function PortalProjectsPage() {
  const session = await requireClientPortalSession("/portal/projects");

  const projects = await prisma.project.findMany({
    where: { clientId: session.client.id },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { milestones: { where: { visibleToClient: true } } } } },
  });

  return (
    <main className="py-8">
      <Container className="flex flex-col gap-6">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Projects</h1>

        {projects.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">No projects yet.</CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <Link key={project.id} href={`/portal/projects/${project.id}`}>
                <Card glass className="h-full transition-transform duration-150 hover:-translate-y-0.5">
                  <CardContent className="flex flex-col gap-3 p-5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium text-foreground">{project.name}</p>
                      <Badge variant="outline">{project.status.replace(/_/g, " ")}</Badge>
                    </div>
                    {project.description && <p className="line-clamp-2 text-xs text-muted-foreground">{project.description}</p>}
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${project.progress}%` }} />
                      </div>
                      <span className="text-xs text-muted-foreground">{project.progress}%</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{project._count.milestones} milestone{project._count.milestones === 1 ? "" : "s"} shared</p>
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
