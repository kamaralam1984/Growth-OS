"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { resolveActiveMembership } from "@/app/dashboard/_lib/require-membership";
import { logActivity } from "@/lib/activity";
import { logAudit } from "@/lib/audit";
import { saveProjectFileVersion, deleteProjectFileVersion } from "@/lib/storage/project-files";
import { uploadProjectFileSchema } from "@/lib/validations/project";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

const MAX_FILE_BYTES = 20 * 1024 * 1024;

async function resolveProjectInOrg(userId: string, projectId: string) {
  const membership = await resolveActiveMembership(userId);
  if (!membership) return null;
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project || project.organizationId !== membership.organizationId) return null;
  return { membership, project };
}

/**
 * Real local-disk versioned file upload scoped to a project. When
 * `formData.projectFileId` is absent this creates a brand new ProjectFile
 * plus its first ProjectFileVersion (versionNumber 1). When it is present
 * this appends a new ProjectFileVersion (versionNumber = current max + 1)
 * to that existing ProjectFile — the file's identity, name, and folder
 * never change on a version upload.
 */
export async function uploadProjectFile(projectId: string, formData: FormData): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const resolved = await resolveProjectInOrg(userId, projectId);
  if (!resolved) return { ok: false, error: "Project not found." };
  const organizationId = resolved.membership.organizationId;

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choose a file to upload." };
  }
  if (file.size > MAX_FILE_BYTES) {
    return { ok: false, error: "Files must be 20MB or smaller." };
  }

  const parsed = uploadProjectFileSchema.safeParse({
    projectFileId: formData.get("projectFileId") ?? undefined,
    folder: formData.get("folder") ?? undefined,
    visibleToClient: formData.get("visibleToClient") === "on",
    changeNote: formData.get("changeNote") ?? undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid upload." };
  }
  const { projectFileId, folder, visibleToClient, changeNote } = parsed.data;
  const mimeType = file.type || "application/octet-stream";
  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    if (projectFileId) {
      const existing = await prisma.projectFile.findUnique({ where: { id: projectFileId } });
      if (!existing || existing.organizationId !== organizationId || existing.projectId !== projectId) {
        return { ok: false, error: "File not found." };
      }

      const latest = await prisma.projectFileVersion.aggregate({
        where: { projectFileId },
        _max: { versionNumber: true },
      });
      const versionNumber = (latest._max.versionNumber ?? 0) + 1;

      const storageKey = await saveProjectFileVersion(organizationId, `${projectFileId}-v${versionNumber}`, file.name, buffer);
      await prisma.projectFileVersion.create({
        data: {
          projectFileId,
          versionNumber,
          storageKey,
          mimeType,
          sizeBytes: file.size,
          changeNote: changeNote || null,
          uploadedByUserId: userId,
        },
      });

      await logActivity({
        organizationId,
        type: "SYSTEM_EVENT",
        description: `${session.user?.name ?? "A team member"} uploaded a new version (v${versionNumber}) of "${existing.name}" in "${resolved.project.name}".`,
        actorUserId: userId,
        metadata: { projectFileId, versionNumber, projectId },
      });
      await logAudit({ userId, organizationId, action: "projects.file_version_uploaded", metadata: { projectFileId, versionNumber, projectId } });
    } else {
      const projectFile = await prisma.projectFile.create({
        data: {
          organizationId,
          projectId,
          name: file.name,
          folder: folder || null,
          visibleToClient,
          uploadedByUserId: userId,
        },
      });

      try {
        const storageKey = await saveProjectFileVersion(organizationId, `${projectFile.id}-v1`, file.name, buffer);
        await prisma.projectFileVersion.create({
          data: {
            projectFileId: projectFile.id,
            versionNumber: 1,
            storageKey,
            mimeType,
            sizeBytes: file.size,
            changeNote: changeNote || null,
            uploadedByUserId: userId,
          },
        });
      } catch (versionError) {
        await prisma.projectFile.delete({ where: { id: projectFile.id } }).catch(() => {});
        throw versionError;
      }

      await logActivity({
        organizationId,
        type: "SYSTEM_EVENT",
        description: `${session.user?.name ?? "A team member"} uploaded "${projectFile.name}" to "${resolved.project.name}".`,
        actorUserId: userId,
        metadata: { projectFileId: projectFile.id, projectId },
      });
      await logAudit({ userId, organizationId, action: "projects.file_uploaded", metadata: { projectFileId: projectFile.id, projectId } });
    }

    revalidatePath(`/dashboard/projects/${projectId}/files`);
    return { ok: true };
  } catch (error) {
    console.error("[projects/files] uploadProjectFile failed:", error);
    return { ok: false, error: "Something went wrong uploading the file. Please try again." };
  }
}

export async function updateProjectFileVisibility(projectFileId: string, visibleToClient: boolean): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const membership = await resolveActiveMembership(userId);
  if (!membership) return { ok: false, error: "You don't belong to an organization yet." };

  const projectFile = await prisma.projectFile.findUnique({ where: { id: projectFileId } });
  if (!projectFile || projectFile.organizationId !== membership.organizationId) {
    return { ok: false, error: "File not found." };
  }

  await prisma.projectFile.update({ where: { id: projectFileId }, data: { visibleToClient } });
  revalidatePath(`/dashboard/projects/${projectFile.projectId}/files`);
  return { ok: true };
}

export async function deleteProjectFile(projectFileId: string): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const membership = await resolveActiveMembership(userId);
  if (!membership) return { ok: false, error: "You don't belong to an organization yet." };

  const projectFile = await prisma.projectFile.findUnique({ where: { id: projectFileId }, include: { versions: true } });
  if (!projectFile || projectFile.organizationId !== membership.organizationId) {
    return { ok: false, error: "File not found." };
  }

  await Promise.all(projectFile.versions.map((version) => deleteProjectFileVersion(version.storageKey)));
  // Cascades to ProjectFileVersion rows via the schema's onDelete: Cascade.
  await prisma.projectFile.delete({ where: { id: projectFileId } });
  await logAudit({ userId, organizationId: membership.organizationId, action: "projects.file_deleted", metadata: { projectFileId } });

  revalidatePath(`/dashboard/projects/${projectFile.projectId}/files`);
  return { ok: true };
}
