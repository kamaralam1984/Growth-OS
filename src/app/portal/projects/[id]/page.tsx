import { notFound } from "next/navigation";
import { Download, FileText } from "lucide-react";

import { Container } from "@/components/ui/container";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/prisma";
import { requireClientPortalSession } from "@/lib/client-portal/auth";
import { MilestoneApprovalCard } from "./_components/milestone-approval-card";
import { CommentsPanel, RaiseTicketPanel } from "./_components/comments-and-tickets";

export default async function PortalProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireClientPortalSession(`/portal/projects/${id}`);

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      milestones: { where: { visibleToClient: true }, orderBy: { order: "asc" } },
      documents: { where: { visibleToClient: true }, orderBy: { createdAt: "desc" } },
    },
  });
  if (!project || project.clientId !== session.client.id) notFound();

  // ProjectFile is the new versioned model files are uploaded through (see
  // /dashboard/projects/[id]/files) — Document.linkedProjectId is legacy but
  // still readable here so files uploaded before the switch keep showing.
  // Only the CURRENT (highest versionNumber) version of a visibleToClient
  // ProjectFile is ever exposed to a client.
  const projectFiles = await prisma.projectFile.findMany({
    where: { projectId: id, visibleToClient: true },
    include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } },
  });

  const sharedFiles = [
    ...project.documents.map((d) => ({
      id: d.id,
      name: d.name,
      sizeBytes: d.sizeBytes,
      href: `/api/documents/${d.id}`,
      createdAt: d.createdAt,
    })),
    ...projectFiles
      .filter((pf) => pf.versions.length > 0)
      .map((pf) => ({
        id: pf.versions[0].id,
        name: pf.name,
        sizeBytes: pf.versions[0].sizeBytes,
        href: `/api/project-files/${pf.versions[0].id}`,
        createdAt: pf.versions[0].createdAt,
      })),
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const [comments, visibleTasks] = await Promise.all([
    prisma.comment.findMany({
      where: { organizationId: session.organizationId, docKind: "PROJECT", docId: id },
      orderBy: { createdAt: "desc" },
      include: { authorUser: { select: { name: true } }, authorClientPortalUser: { select: { name: true } } },
      take: 30,
    }),
    prisma.task.findMany({ where: { projectId: id, visibleToClient: true }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, title: true, status: true, dueDate: true } }),
  ]);

  return (
    <main className="py-8">
      <Container className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">{project.name}</h1>
            {project.description && <p className="text-sm text-muted-foreground">{project.description}</p>}
          </div>
          <Badge variant="outline">{project.status.replace(/_/g, " ")}</Badge>
        </div>

        <Card>
          <CardContent className="flex items-center gap-3 p-5">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary" style={{ width: `${project.progress}%` }} />
            </div>
            <span className="text-sm font-semibold text-foreground">{project.progress}% complete</span>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <section className="flex flex-col gap-3 lg:col-span-2">
            <h2 className="text-lg font-semibold text-foreground">Milestones</h2>
            {project.milestones.length === 0 ? (
              <p className="text-sm text-muted-foreground">No milestones shared yet.</p>
            ) : (
              project.milestones.map((m) => (
                <MilestoneApprovalCard
                  key={m.id}
                  milestone={{
                    id: m.id,
                    name: m.name,
                    description: m.description,
                    dueDate: m.dueDate ? m.dueDate.toISOString() : null,
                    status: m.status,
                    clientApprovedAt: m.clientApprovedAt ? m.clientApprovedAt.toISOString() : null,
                    clientSatisfactionRating: m.clientSatisfactionRating,
                  }}
                />
              ))
            )}

            {visibleTasks.length > 0 && (
              <>
                <h2 className="mt-2 text-lg font-semibold text-foreground">Shared tasks</h2>
                <Card>
                  <CardContent className="flex flex-col divide-y divide-border p-0">
                    {visibleTasks.map((t) => (
                      <div key={t.id} className="flex items-center justify-between gap-3 p-3">
                        <p className="text-sm text-foreground">{t.title}</p>
                        <div className="flex items-center gap-2">
                          {t.dueDate && <span className="text-xs text-muted-foreground">{new Date(t.dueDate).toLocaleDateString()}</span>}
                          <Badge variant="outline">{t.status.replace(/_/g, " ")}</Badge>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </>
            )}

            <h2 className="mt-2 flex items-center gap-2 text-lg font-semibold text-foreground">
              <FileText className="size-5" /> Files
            </h2>
            {sharedFiles.length === 0 ? (
              <p className="text-sm text-muted-foreground">No files shared yet.</p>
            ) : (
              <Card>
                <CardContent className="flex flex-col divide-y divide-border p-0">
                  {sharedFiles.map((file) => (
                    <a key={file.id} href={file.href} className="flex items-center justify-between gap-3 p-3 transition-colors hover:bg-accent">
                      <div>
                        <p className="text-sm text-foreground">{file.name}</p>
                        <p className="text-xs text-muted-foreground">{(file.sizeBytes / 1024).toFixed(0)} KB</p>
                      </div>
                      <Download className="size-4 text-muted-foreground" />
                    </a>
                  ))}
                </CardContent>
              </Card>
            )}
          </section>

          <div className="flex flex-col gap-6">
            <RaiseTicketPanel projectId={id} />
            <CommentsPanel
              projectId={id}
              comments={comments.map((c) => ({
                id: c.id,
                content: c.content,
                authorName: c.authorUser?.name ?? c.authorClientPortalUser?.name ?? "You",
                createdAt: c.createdAt.toISOString(),
              }))}
            />
          </div>
        </div>
      </Container>
    </main>
  );
}
