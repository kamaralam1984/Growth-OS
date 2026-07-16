import Link from "next/link";
import { FolderKanban, Flag, Receipt, ArrowRight } from "lucide-react";

import { Container } from "@/components/ui/container";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/prisma";
import { requireClientPortalSession } from "@/lib/client-portal/auth";

export default async function PortalDashboardPage() {
  const session = await requireClientPortalSession("/portal/dashboard");

  const projects = await prisma.project.findMany({
    where: { clientId: session.client.id },
    orderBy: { createdAt: "desc" },
    include: {
      milestones: { where: { visibleToClient: true }, orderBy: { order: "asc" } },
      _count: { select: { tasks: { where: { visibleToClient: true } } } },
    },
  });

  const projectIds = projects.map((p) => p.id);
  const [openInvoicesCount, upcomingMilestones] = await Promise.all([
    prisma.invoice.count({ where: { clientId: session.client.id, status: { in: ["SENT", "OVERDUE"] } } }),
    prisma.milestone.findMany({
      where: { projectId: { in: projectIds }, visibleToClient: true, status: { not: "COMPLETED" } },
      orderBy: { dueDate: "asc" },
      take: 5,
      include: { project: { select: { name: true, id: true } } },
    }),
  ]);

  return (
    <main className="py-8">
      <Container className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Welcome, {session.client.name}</h1>
          <p className="text-sm text-muted-foreground">Real-time status of your projects, milestones, and account.</p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card>
            <CardContent className="p-6">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Active projects</p>
              <p className="mt-2 text-3xl font-semibold text-foreground">{projects.filter((p) => p.status === "ACTIVE").length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Upcoming milestones</p>
              <p className="mt-2 text-3xl font-semibold text-foreground">{upcomingMilestones.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Open invoices</p>
              <p className="mt-2 text-3xl font-semibold text-foreground">{openInvoicesCount}</p>
            </CardContent>
          </Card>
        </div>

        <section className="flex flex-col gap-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <FolderKanban className="size-5" /> Your projects
          </h2>
          {projects.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-sm text-muted-foreground">No projects yet.</CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {projects.map((project) => (
                <Link key={project.id} href={`/portal/projects/${project.id}`}>
                  <Card glass className="h-full transition-transform duration-150 hover:-translate-y-0.5">
                    <CardContent className="flex flex-col gap-2 p-5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium text-foreground">{project.name}</p>
                        <Badge variant="outline">{project.status.replace(/_/g, " ")}</Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-primary" style={{ width: `${project.progress}%` }} />
                        </div>
                        <span className="text-xs text-muted-foreground">{project.progress}%</span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {project.milestones.length} milestone{project.milestones.length === 1 ? "" : "s"} · {project._count.tasks} visible task{project._count.tasks === 1 ? "" : "s"}
                      </p>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </section>

        {upcomingMilestones.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
              <Flag className="size-5" /> Upcoming milestones
            </h2>
            <Card>
              <CardContent className="flex flex-col divide-y divide-border p-0">
                {upcomingMilestones.map((m) => (
                  <Link key={m.id} href={`/portal/projects/${m.project.id}`} className="flex items-center justify-between gap-3 p-4 transition-colors hover:bg-accent">
                    <div>
                      <p className="text-sm text-foreground">{m.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {m.project.name} {m.dueDate ? `· Due ${m.dueDate.toLocaleDateString()}` : ""}
                      </p>
                    </div>
                    <ArrowRight className="size-4 text-muted-foreground" />
                  </Link>
                ))}
              </CardContent>
            </Card>
          </section>
        )}

        <section className="flex flex-col gap-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <Receipt className="size-5" /> Quick links
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Link href="/portal/invoices" className="rounded-xl border border-border p-4 text-sm text-foreground transition-colors hover:bg-accent">
              Invoices
            </Link>
            <Link href="/portal/contracts" className="rounded-xl border border-border p-4 text-sm text-foreground transition-colors hover:bg-accent">
              Contracts
            </Link>
            <Link href="/portal/proposals" className="rounded-xl border border-border p-4 text-sm text-foreground transition-colors hover:bg-accent">
              Proposals
            </Link>
            <Link href="/portal/security" className="rounded-xl border border-border p-4 text-sm text-foreground transition-colors hover:bg-accent">
              Security
            </Link>
          </div>
        </section>
      </Container>
    </main>
  );
}
