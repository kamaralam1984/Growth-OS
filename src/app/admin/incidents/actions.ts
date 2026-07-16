"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requirePlatformOwner } from "@/lib/billing/platform-admin";
import { logAudit } from "@/lib/audit";
import { addIncidentUpdate, createIncident, resolveIncident } from "@/lib/security/incidents";
import type { IncidentSeverity, IncidentStatus } from "@/generated/prisma/client";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

const VALID_SEVERITIES = new Set<IncidentSeverity>(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
const VALID_STATUSES = new Set<IncidentStatus>(["OPEN", "INVESTIGATING", "MONITORING", "RESOLVED"]);

const createIncidentSchema = z.object({
  title: z.string().trim().min(1, "Enter a title.").max(200),
  description: z.string().trim().max(5000).optional(),
  severity: z.string(),
});

export async function createIncidentAction(input: unknown): Promise<ActionResult> {
  const { userId } = await requirePlatformOwner("/admin/incidents");

  const parsed = createIncidentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the incident fields." };
  }
  if (!VALID_SEVERITIES.has(parsed.data.severity as IncidentSeverity)) {
    return { ok: false, error: "Choose a valid severity." };
  }

  try {
    const incident = await createIncident({
      title: parsed.data.title,
      description: parsed.data.description,
      severity: parsed.data.severity as IncidentSeverity,
    });
    await logAudit({ userId, action: "admin.incident_created", metadata: { incidentId: incident.id } });
    revalidatePath("/admin/incidents");
    return { ok: true };
  } catch (error) {
    console.error("[admin/incidents] createIncidentAction failed:", error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

const addUpdateSchema = z.object({
  incidentId: z.string().trim().min(1),
  message: z.string().trim().min(1, "Enter an update message.").max(5000),
  status: z.string(),
});

export async function addIncidentUpdateAction(input: unknown): Promise<ActionResult> {
  const { userId } = await requirePlatformOwner("/admin/incidents");

  const parsed = addUpdateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the update fields." };
  }
  if (!VALID_STATUSES.has(parsed.data.status as IncidentStatus)) {
    return { ok: false, error: "Choose a valid status." };
  }

  try {
    await addIncidentUpdate(parsed.data.incidentId, parsed.data.message, parsed.data.status as IncidentStatus);
    await logAudit({
      userId,
      action: "admin.incident_update_added",
      metadata: { incidentId: parsed.data.incidentId, status: parsed.data.status },
    });
    revalidatePath(`/admin/incidents/${parsed.data.incidentId}`);
    revalidatePath("/admin/incidents");
    return { ok: true };
  } catch (error) {
    console.error("[admin/incidents] addIncidentUpdateAction failed:", error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

const resolveSchema = z.object({
  incidentId: z.string().trim().min(1),
  postmortem: z.string().trim().max(10000).optional(),
});

export async function resolveIncidentAction(input: unknown): Promise<ActionResult> {
  const { userId } = await requirePlatformOwner("/admin/incidents");

  const parsed = resolveSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the fields." };
  }

  try {
    await resolveIncident(parsed.data.incidentId, parsed.data.postmortem);
    await logAudit({
      userId,
      action: "admin.incident_resolved",
      metadata: { incidentId: parsed.data.incidentId },
    });
    revalidatePath(`/admin/incidents/${parsed.data.incidentId}`);
    revalidatePath("/admin/incidents");
    return { ok: true };
  } catch (error) {
    console.error("[admin/incidents] resolveIncidentAction failed:", error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}
