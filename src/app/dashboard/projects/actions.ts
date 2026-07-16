"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { resolveActiveMembership } from "@/app/dashboard/_lib/require-membership";
import { logActivity } from "@/lib/activity";
import { logAudit } from "@/lib/audit";
import { notifyOrganizationOwners } from "@/lib/notifications";
import { fireWorkflowTrigger } from "@/lib/workflows/triggers";
import { seedStandardMilestones } from "@/lib/projects/milestones";
import { ensureProjectManagerAgentProvisioned } from "@/lib/ai/project-manager-orchestrator";
import {
  projectSchema,
  projectDetailsSchema,
  addProjectMemberSchema,
  type ProjectInput,
  type ProjectDetailsInput,
  type ProjectStatusInput,
  type AddProjectMemberInput,
} from "@/lib/validations/project";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

const PRIVILEGED_ROLES = new Set(["OWNER", "ADMIN"]);

async function resolveProjectInOrg(userId: string, projectId: string) {
  const membership = await resolveActiveMembership(userId);
  if (!membership) return null;
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project || project.organizationId !== membership.organizationId) return null;
  return { membership, project };
}

export interface CreateProjectResult extends ActionResult {
  projectId?: string;
}

export async function createProject(input: ProjectInput): Promise<CreateProjectResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const parsed = projectSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the project details." };
  }

  const membership = await resolveActiveMembership(userId);
  if (!membership) return { ok: false, error: "You don't belong to an organization yet." };
  const organizationId = membership.organizationId;

  try {
    const project = await prisma.project.create({
      data: {
        organizationId,
        name: parsed.data.name,
        description: parsed.data.description || null,
        companyId: parsed.data.companyId || null,
        clientId: parsed.data.clientId || null,
        status: parsed.data.status,
        projectType: parsed.data.projectType,
        priority: parsed.data.priority,
        budget: parsed.data.budget ?? null,
        tags: parsed.data.tags,
        department: parsed.data.department || null,
        ownerUserId: userId,
        startDate: parsed.data.startDate ?? null,
        dueDate: parsed.data.dueDate ?? null,
      },
    });

    await seedStandardMilestones(project.id);
    await prisma.projectMember.upsert({
      where: { projectId_userId: { projectId: project.id, userId } },
      create: { projectId: project.id, userId, organizationId, role: "PROJECT_MANAGER" },
      update: {},
    });
    await ensureProjectManagerAgentProvisioned(organizationId).catch((error) => {
      console.error("[projects] ensureProjectManagerAgentProvisioned failed:", error);
    });

    await logActivity({
      organizationId,
      type: "SYSTEM_EVENT",
      description: `${session.user?.name ?? "A team member"} created project "${project.name}".`,
      actorUserId: userId,
      metadata: { projectId: project.id },
    });
    await logAudit({ userId, organizationId, action: "projects.project_created", metadata: { projectId: project.id } });
    await notifyOrganizationOwners({
      organizationId,
      type: "PROJECT_CREATED",
      title: "Project created",
      message: `"${project.name}" was created and is ready for planning.`,
    });
    await fireWorkflowTrigger(organizationId, "PROJECT_CREATED", { projectId: project.id, name: project.name, companyId: project.companyId, clientId: project.clientId, budget: project.budget });

    revalidatePath("/dashboard/projects");
    return { ok: true, projectId: project.id };
  } catch (error) {
    console.error("[projects] createProject failed:", error);
    return { ok: false, error: "Something went wrong creating the project. Please try again." };
  }
}

export async function updateProjectStatus(projectId: string, status: ProjectStatusInput): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const resolved = await resolveProjectInOrg(userId, projectId);
  if (!resolved) return { ok: false, error: "Project not found." };

  try {
    await prisma.project.update({ where: { id: projectId }, data: { status } });
    await logAudit({
      userId,
      organizationId: resolved.membership.organizationId,
      action: "projects.status_updated",
      metadata: { projectId, status },
    });

    revalidatePath("/dashboard/projects");
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { ok: true };
  } catch (error) {
    console.error("[projects] updateProjectStatus failed:", error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

export async function updateProjectDetails(projectId: string, input: ProjectDetailsInput): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const parsed = projectDetailsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the project details." };

  const resolved = await resolveProjectInOrg(userId, projectId);
  if (!resolved) return { ok: false, error: "Project not found." };
  if (!PRIVILEGED_ROLES.has(resolved.membership.role)) {
    return { ok: false, error: "Only owners and admins can edit project details." };
  }

  try {
    await prisma.project.update({
      where: { id: projectId },
      data: {
        name: parsed.data.name,
        description: parsed.data.description || null,
        companyId: parsed.data.companyId || null,
        clientId: parsed.data.clientId || null,
        projectType: parsed.data.projectType,
        priority: parsed.data.priority,
        budget: parsed.data.budget ?? null,
        tags: parsed.data.tags,
        department: parsed.data.department || null,
        startDate: parsed.data.startDate ?? null,
        dueDate: parsed.data.dueDate ?? null,
      },
    });
    await logAudit({ userId, organizationId: resolved.membership.organizationId, action: "projects.details_updated", metadata: { projectId } });

    revalidatePath(`/dashboard/projects/${projectId}`);
    return { ok: true };
  } catch (error) {
    console.error("[projects] updateProjectDetails failed:", error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

export async function addProjectMember(projectId: string, input: AddProjectMemberInput): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const parsed = addProjectMemberSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the team member details." };

  const resolved = await resolveProjectInOrg(userId, projectId);
  if (!resolved) return { ok: false, error: "Project not found." };
  if (!PRIVILEGED_ROLES.has(resolved.membership.role)) {
    return { ok: false, error: "Only owners and admins can manage the project team." };
  }

  const memberOrg = await prisma.membership.findUnique({
    where: { userId_organizationId: { userId: parsed.data.userId, organizationId: resolved.membership.organizationId } },
  });
  if (!memberOrg || memberOrg.status !== "ACTIVE") {
    return { ok: false, error: "That person isn't an active member of this organization." };
  }

  try {
    await prisma.projectMember.upsert({
      where: { projectId_userId: { projectId, userId: parsed.data.userId } },
      create: {
        projectId,
        userId: parsed.data.userId,
        organizationId: resolved.membership.organizationId,
        role: parsed.data.role,
        hourlyRate: parsed.data.hourlyRate ?? null,
        capacityHoursPerWeek: parsed.data.capacityHoursPerWeek ?? null,
      },
      update: {
        role: parsed.data.role,
        hourlyRate: parsed.data.hourlyRate ?? null,
        capacityHoursPerWeek: parsed.data.capacityHoursPerWeek ?? null,
      },
    });
    await logAudit({
      userId,
      organizationId: resolved.membership.organizationId,
      action: "projects.member_added",
      metadata: { projectId, memberUserId: parsed.data.userId, role: parsed.data.role },
    });

    revalidatePath(`/dashboard/projects/${projectId}`);
    return { ok: true };
  } catch (error) {
    console.error("[projects] addProjectMember failed:", error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

export async function removeProjectMember(projectId: string, memberUserId: string): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const resolved = await resolveProjectInOrg(userId, projectId);
  if (!resolved) return { ok: false, error: "Project not found." };
  if (!PRIVILEGED_ROLES.has(resolved.membership.role)) {
    return { ok: false, error: "Only owners and admins can manage the project team." };
  }

  await prisma.projectMember.deleteMany({ where: { projectId, userId: memberUserId } });
  await logAudit({ userId, organizationId: resolved.membership.organizationId, action: "projects.member_removed", metadata: { projectId, memberUserId } });

  revalidatePath(`/dashboard/projects/${projectId}`);
  return { ok: true };
}
