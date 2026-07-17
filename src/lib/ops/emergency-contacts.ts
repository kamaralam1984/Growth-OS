import { prisma } from "@/lib/prisma";
import type { EmergencyContact } from "@/generated/prisma/client";

/**
 * Real platform-wide escalation contacts for the Business Continuity /
 * Disaster Recovery dashboard (Production Dashboard) — plain admin-managed
 * data. A name/role/email/phone is inherently configuration, not something
 * any code could "compute" — the honest way to satisfy "Emergency Contacts"
 * is a real, editable roster, not a fabricated on-call schedule.
 */

export interface UpsertEmergencyContactInput {
  name: string;
  role: string;
  email: string;
  phone?: string;
  escalationOrder: number;
}

export async function createEmergencyContact(input: UpsertEmergencyContactInput): Promise<EmergencyContact> {
  return prisma.emergencyContact.create({
    data: { name: input.name, role: input.role, email: input.email, phone: input.phone || null, escalationOrder: input.escalationOrder },
  });
}

export async function updateEmergencyContact(id: string, input: UpsertEmergencyContactInput): Promise<EmergencyContact> {
  return prisma.emergencyContact.update({
    where: { id },
    data: { name: input.name, role: input.role, email: input.email, phone: input.phone || null, escalationOrder: input.escalationOrder },
  });
}

export async function deactivateEmergencyContact(id: string): Promise<EmergencyContact> {
  return prisma.emergencyContact.update({ where: { id }, data: { active: false } });
}

export async function listEmergencyContacts(activeOnly = true): Promise<EmergencyContact[]> {
  return prisma.emergencyContact.findMany({
    where: activeOnly ? { active: true } : undefined,
    orderBy: { escalationOrder: "asc" },
  });
}
