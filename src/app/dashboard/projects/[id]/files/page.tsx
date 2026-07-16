import { notFound } from "next/navigation";

import { Container } from "@/components/ui/container";
import { prisma } from "@/lib/prisma";
import { requireActiveMembership } from "@/app/dashboard/_lib/require-membership";
import { ProjectFileUploadForm } from "./_components/project-file-upload-form";
import { ProjectFileList, type ProjectFileDisplay } from "./_components/project-file-list";

export default async function ProjectFilesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { membership } = await requireActiveMembership(`/dashboard/projects/${id}/files`);
  const canManage = membership.role === "OWNER" || membership.role === "ADMIN";

  const project = await prisma.project.findUnique({ where: { id }, select: { id: true, name: true, organizationId: true } });
  if (!project || project.organizationId !== membership.organizationId) notFound();

  const projectFiles = await prisma.projectFile.findMany({
    where: { projectId: id },
    orderBy: { createdAt: "desc" },
    include: { versions: { orderBy: { versionNumber: "desc" } } },
  });

  const uploaderIds = new Set<string>();
  for (const pf of projectFiles) {
    if (pf.uploadedByUserId) uploaderIds.add(pf.uploadedByUserId);
    for (const v of pf.versions) if (v.uploadedByUserId) uploaderIds.add(v.uploadedByUserId);
  }
  const uploaders = uploaderIds.size
    ? await prisma.user.findMany({ where: { id: { in: [...uploaderIds] } }, select: { id: true, name: true } })
    : [];
  const uploaderNameById = new Map(uploaders.map((u) => [u.id, u.name]));

  const rows: ProjectFileDisplay[] = projectFiles.map((pf) => {
    const versions = pf.versions.map((v) => ({
      id: v.id,
      versionNumber: v.versionNumber,
      mimeType: v.mimeType,
      sizeBytes: v.sizeBytes,
      changeNote: v.changeNote,
      createdAt: v.createdAt.toISOString(),
      uploadedByName: v.uploadedByUserId ? (uploaderNameById.get(v.uploadedByUserId) ?? null) : null,
    }));

    return {
      id: pf.id,
      name: pf.name,
      folder: pf.folder,
      visibleToClient: pf.visibleToClient,
      current: versions[0] ?? null,
      olderVersions: versions.slice(1),
    };
  });

  return (
    <main className="py-8">
      <Container className="flex max-w-3xl flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">{project.name} — Files</h1>
            <p className="text-sm text-muted-foreground">Real local-disk file storage with version history — mark a file &quot;Visible to client&quot; to share it in the Client Portal.</p>
          </div>
          <ProjectFileUploadForm projectId={id} />
        </div>
        <ProjectFileList projectId={id} files={rows} canManage={canManage} />
      </Container>
    </main>
  );
}
