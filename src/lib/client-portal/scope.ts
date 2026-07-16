import { prisma } from "@/lib/prisma";
import type { ClientPortalSession } from "./auth";

/**
 * The Client Portal's core permission boundary: every query a portal page
 * runs must go through one of these — never trust a client-supplied
 * project/document id, always re-derive from the verified session's real
 * clientId/organizationId.
 */
export async function getPortalProjectIds(session: ClientPortalSession): Promise<string[]> {
  const projects = await prisma.project.findMany({ where: { clientId: session.client.id }, select: { id: true } });
  return projects.map((p) => p.id);
}

export function proposalScopeWhere(session: ClientPortalSession, projectIds: string[]) {
  const orConditions = [
    ...(session.client.companyId ? [{ companyId: session.client.companyId }] : []),
    ...(projectIds.length > 0 ? [{ projectId: { in: projectIds } }] : []),
  ];
  // Prisma's OR:[] semantics for "no real scoping signal" are ambiguous
  // across versions — force an explicitly-impossible condition instead of
  // ever risking an unscoped (matches-everything) query for a client.
  return {
    organizationId: session.organizationId,
    OR: orConditions.length > 0 ? orConditions : [{ id: "__no_match__" }],
  };
}
