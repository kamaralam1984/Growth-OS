import { prisma } from "@/lib/prisma";
import type { Incident, IncidentSeverity, IncidentStatus, IncidentUpdate } from "@/generated/prisma/client";

/**
 * Real platform-operator incident tracking (Incident/IncidentUpdate models —
 * see "Final Phase: Enterprise Security, Monitoring, DR, Compliance" in
 * prisma/schema.prisma). Platform-wide, not organization-scoped — mirrors
 * the existing Admin Billing Dashboard's cross-tenant posture, gated by
 * `requirePlatformOwner` in the UI layer (src/app/admin/incidents), never by
 * `Membership`.
 */

export interface CreateIncidentInput {
  title: string;
  description?: string;
  severity: IncidentSeverity;
}

export async function createIncident(input: CreateIncidentInput): Promise<Incident> {
  const incident = await prisma.incident.create({
    data: { title: input.title, description: input.description, severity: input.severity },
  });
  await prisma.incidentUpdate.create({
    data: { incidentId: incident.id, message: "Incident opened.", status: incident.status },
  });
  return incident;
}

/**
 * Appends a real, immutable timeline entry (IncidentUpdate rows are never
 * edited once created, matching AuditLog/SecurityEvent's create-only
 * discipline) and moves the Incident's own `status` to match — the two
 * writes happen in one transaction so the Incident's current status can
 * never drift from its own most recent update.
 */
export async function addIncidentUpdate(incidentId: string, message: string, status: IncidentStatus): Promise<IncidentUpdate> {
  const [update] = await prisma.$transaction([
    prisma.incidentUpdate.create({ data: { incidentId, message, status } }),
    prisma.incident.update({ where: { id: incidentId }, data: { status } }),
  ]);
  return update;
}

export async function resolveIncident(incidentId: string, postmortem?: string): Promise<Incident> {
  const [, incident] = await prisma.$transaction([
    prisma.incidentUpdate.create({
      data: {
        incidentId,
        message: postmortem ? `Resolved. ${postmortem}` : "Resolved.",
        status: "RESOLVED",
      },
    }),
    prisma.incident.update({
      where: { id: incidentId },
      data: { status: "RESOLVED", resolvedAt: new Date(), postmortem },
    }),
  ]);
  return incident;
}

export async function listOpenIncidents(): Promise<Incident[]> {
  return prisma.incident.findMany({
    where: { status: { not: "RESOLVED" } },
    orderBy: { startedAt: "desc" },
  });
}

/**
 * Real auto-incident trigger for CRITICAL-severity SecurityEvents.
 *
 * DESIGN CHOICE (documented per the brief): this is called as a SEPARATE
 * call site right after `logSecurityEvent` persists a CRITICAL-severity
 * event (see src/lib/security/security-events.ts's `logSecurityEvent`,
 * which calls this at the end of its own try block) rather than having
 * Incident-creation business logic live inside `logSecurityEvent` itself —
 * this keeps `logSecurityEvent` a thin, dependency-light logger (it already
 * has zero business-rule branching today) and keeps ALL Incident-creation
 * rules (dedup window, title format, initial update text) owned by this
 * one file, the same separation of concerns AuditLog vs. SecurityEvent
 * already models.
 *
 * Dedup rule: appends to an existing OPEN/INVESTIGATING/MONITORING incident
 * with the same derived title if one exists, rather than opening a new
 * Incident per repeated occurrence of the same CRITICAL event type (e.g. a
 * sustained brute-force attempt would otherwise open dozens of incidents).
 * Fire-and-forget from the caller's perspective — a failure here must never
 * break the security-event write that triggered it.
 */
export async function ensureIncidentForCriticalEvent(input: {
  type: string;
  detail?: string | null;
}): Promise<void> {
  try {
    const title = `${input.type.replace(/_/g, " ")} detected`;

    const existing = await prisma.incident.findFirst({
      where: { title, status: { not: "RESOLVED" } },
      orderBy: { startedAt: "desc" },
    });

    if (existing) {
      await prisma.incidentUpdate.create({
        data: {
          incidentId: existing.id,
          message: input.detail ? `Recurred: ${input.detail}` : "Recurred.",
          status: existing.status,
        },
      });
      return;
    }

    const incident = await prisma.incident.create({
      data: {
        title,
        description: input.detail ?? undefined,
        severity: "CRITICAL",
        status: "OPEN",
      },
    });
    await prisma.incidentUpdate.create({
      data: {
        incidentId: incident.id,
        message: "Auto-opened from a CRITICAL security event.",
        status: "OPEN",
      },
    });
  } catch (error) {
    console.error("[security/incidents] ensureIncidentForCriticalEvent failed:", error);
  }
}
