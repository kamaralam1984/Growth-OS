"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { logAudit } from "@/lib/audit";
import { notifyOrganizationOwners } from "@/lib/notifications";
import { fireWorkflowTrigger } from "@/lib/workflows/triggers";
import { getClientPortalSession } from "@/lib/client-portal/auth";
import { publishRealtimeEvent } from "@/lib/realtime/event-bus";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

async function resolvePortalProject(projectId: string) {
  const session = await getClientPortalSession();
  if (!session) return null;
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project || project.clientId !== session.client.id) return null;
  return { session, project };
}

const approveMilestoneSchema = z.object({
  rating: z.number().int().min(1).max(5).optional(),
});

export async function approveMilestone(milestoneId: string, rating?: number): Promise<ActionResult> {
  const parsed = approveMilestoneSchema.safeParse({ rating });
  if (!parsed.success) return { ok: false, error: "Invalid rating." };

  const milestone = await prisma.milestone.findUnique({ where: { id: milestoneId } });
  if (!milestone) return { ok: false, error: "Milestone not found." };

  const resolved = await resolvePortalProject(milestone.projectId);
  if (!resolved) return { ok: false, error: "You do not have access to this milestone." };
  if (!milestone.visibleToClient) return { ok: false, error: "This milestone isn't available for approval." };

  await prisma.milestone.update({
    where: { id: milestoneId },
    data: {
      clientApprovedAt: new Date(),
      clientApprovedByPortalUserId: resolved.session.clientPortalUser.id,
      clientSatisfactionRating: parsed.data.rating ?? null,
      status: milestone.status === "COMPLETED" ? "COMPLETED" : "IN_PROGRESS",
    },
  });

  // Client actions log with actorUserId: null (ClientPortalUser is not a
  // User row and has no FK into logActivity/logAudit's User-scoped
  // columns) — client identity goes in metadata instead.
  await logActivity({
    organizationId: resolved.session.organizationId,
    type: "SYSTEM_EVENT",
    description: `${resolved.session.client.name} approved milestone "${milestone.name}".`,
    metadata: { milestoneId, projectId: milestone.projectId, clientPortalUserId: resolved.session.clientPortalUser.id },
  });
  await logAudit({
    organizationId: resolved.session.organizationId,
    action: "client_portal.milestone_approved",
    metadata: { milestoneId, projectId: milestone.projectId, clientPortalUserId: resolved.session.clientPortalUser.id, rating: parsed.data.rating },
  });
  await notifyOrganizationOwners({
    organizationId: resolved.session.organizationId,
    type: "CLIENT_APPROVED_MILESTONE",
    title: "Client approved a milestone",
    message: `${resolved.session.client.name} approved "${milestone.name}" on "${resolved.project.name}".`,
  });

  revalidatePath(`/portal/projects/${milestone.projectId}`);
  return { ok: true };
}

const commentSchema = z.object({ content: z.string().trim().min(1, "Write something first.").max(4000) });

export async function postProjectComment(projectId: string, content: string): Promise<ActionResult> {
  const parsed = commentSchema.safeParse({ content });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Write something first." };

  const resolved = await resolvePortalProject(projectId);
  if (!resolved) return { ok: false, error: "You do not have access to this project." };

  await prisma.comment.create({
    data: {
      organizationId: resolved.session.organizationId,
      docKind: "PROJECT",
      docId: projectId,
      authorClientPortalUserId: resolved.session.clientPortalUser.id,
      content: parsed.data.content,
    },
  });

  await logActivity({
    organizationId: resolved.session.organizationId,
    type: "SYSTEM_EVENT",
    description: `${resolved.session.client.name} commented on "${resolved.project.name}".`,
    metadata: { projectId, clientPortalUserId: resolved.session.clientPortalUser.id },
  });
  await notifyOrganizationOwners({
    organizationId: resolved.session.organizationId,
    type: "CLIENT_COMMENT_ADDED",
    title: "New client comment",
    message: `${resolved.session.client.name} commented on "${resolved.project.name}".`,
  });
  await fireWorkflowTrigger(resolved.session.organizationId, "CLIENT_MESSAGE", { projectId, clientId: resolved.session.client.id, clientName: resolved.session.client.name, content: parsed.data.content });
  publishRealtimeEvent({ kind: "comment", organizationId: resolved.session.organizationId, projectId });

  revalidatePath(`/portal/projects/${projectId}`);
  return { ok: true };
}

const ticketSchema = z.object({ title: z.string().trim().min(1, "Give it a short title.").max(200), description: z.string().trim().max(4000).optional() });

/** "Raise Tickets" — a real client-originated Task (TaskType.SUPPORT, clientRaised: true), reusing the same Kanban/task infrastructure rather than a parallel Ticket model. */
export async function raiseTicket(projectId: string, title: string, description?: string): Promise<ActionResult> {
  const parsed = ticketSchema.safeParse({ title, description });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the ticket details." };

  const resolved = await resolvePortalProject(projectId);
  if (!resolved) return { ok: false, error: "You do not have access to this project." };

  const task = await prisma.task.create({
    data: {
      organizationId: resolved.session.organizationId,
      projectId,
      title: parsed.data.title,
      description: parsed.data.description || null,
      type: "SUPPORT",
      status: "BACKLOG",
      clientRaised: true,
      visibleToClient: true,
    },
  });
  await prisma.taskStatusChange.create({
    data: { taskId: task.id, organizationId: resolved.session.organizationId, fromStatus: null, toStatus: "BACKLOG" },
  });

  await logActivity({
    organizationId: resolved.session.organizationId,
    type: "SYSTEM_EVENT",
    description: `${resolved.session.client.name} raised a ticket: "${parsed.data.title}".`,
    metadata: { taskId: task.id, projectId, clientPortalUserId: resolved.session.clientPortalUser.id },
  });
  await notifyOrganizationOwners({
    organizationId: resolved.session.organizationId,
    type: "CLIENT_COMMENT_ADDED",
    title: "Client raised a ticket",
    message: `${resolved.session.client.name} raised "${parsed.data.title}" on "${resolved.project.name}".`,
  });
  await fireWorkflowTrigger(resolved.session.organizationId, "CLIENT_MESSAGE", { projectId, taskId: task.id, clientId: resolved.session.client.id, clientName: resolved.session.client.name, title: parsed.data.title, description: parsed.data.description });
  publishRealtimeEvent({ kind: "comment", organizationId: resolved.session.organizationId, projectId });

  revalidatePath(`/portal/projects/${projectId}`);
  return { ok: true };
}
