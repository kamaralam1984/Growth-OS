"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { resolveActiveMembership } from "@/app/dashboard/_lib/require-membership";
import { logActivity } from "@/lib/activity";
import { logAudit } from "@/lib/audit";
import { getNodeNeighborhood, syncOrganizationGraph } from "@/lib/knowledge-graph/builder";
import type { GraphEntityType } from "@/generated/prisma/client";

/**
 * Server Actions for the Knowledge Graph view — org-scoped via the caller's
 * real ACTIVE Membership (mirroring src/app/dashboard/automation/actions.ts's
 * requireEditableMembership pattern rather than the redirect-based
 * requireActiveMembership in _lib/require-membership.ts, since that helper
 * calls redirect() and is meant for page Server Components, not actions that
 * need to return a typed ok/error result to a client component).
 */

export interface ActionResult {
  ok: boolean;
  error?: string;
}

const REBUILD_ROLES = new Set(["OWNER", "ADMIN"]);

async function requireActiveOrgMembership(userId: string) {
  return resolveActiveMembership(userId);
}

export interface GraphNodeSummary {
  id: string;
  entityType: GraphEntityType;
  entityId: string;
  label: string;
}

export interface SearchGraphNodesResult extends ActionResult {
  nodes?: GraphNodeSummary[];
}

/**
 * Any active member can search/read the graph — label search plus an
 * optional entity-type filter, real rows only, org-scoped.
 */
export async function searchGraphNodesAction(query: string, entityType?: GraphEntityType): Promise<SearchGraphNodesResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const membership = await requireActiveOrgMembership(userId);
  if (!membership) return { ok: false, error: "You don't belong to an organization yet." };

  const trimmed = query.trim();
  const nodes = await prisma.knowledgeGraphNode.findMany({
    where: {
      organizationId: membership.organizationId,
      ...(entityType ? { entityType } : {}),
      ...(trimmed ? { label: { contains: trimmed, mode: "insensitive" as const } } : {}),
    },
    orderBy: { label: "asc" },
    take: 25,
    select: { id: true, entityType: true, entityId: true, label: true },
  });

  return { ok: true, nodes };
}

export interface GraphRelationshipSummary {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  type: string;
  weight: number | null;
}

export interface NeighborhoodResult extends ActionResult {
  nodes?: GraphNodeSummary[];
  relationships?: GraphRelationshipSummary[];
}

/**
 * Any active member can read a node's neighborhood — real BFS traversal via
 * getNodeNeighborhood, capped at depth 3 here regardless of what the caller
 * requests (the builder itself also caps total node count).
 */
export async function getNeighborhoodAction(entityType: GraphEntityType, entityId: string, depth = 1): Promise<NeighborhoodResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const membership = await requireActiveOrgMembership(userId);
  if (!membership) return { ok: false, error: "You don't belong to an organization yet." };

  const { nodes, relationships } = await getNodeNeighborhood(
    membership.organizationId,
    entityType,
    entityId,
    Math.min(Math.max(Math.trunc(depth), 1), 3),
  );

  return {
    ok: true,
    nodes: nodes.map((node) => ({ id: node.id, entityType: node.entityType, entityId: node.entityId, label: node.label })),
    relationships: relationships.map((relationship) => ({
      id: relationship.id,
      fromNodeId: relationship.fromNodeId,
      toNodeId: relationship.toNodeId,
      type: relationship.type,
      weight: relationship.weight,
    })),
  };
}

export interface RebuildGraphResult extends ActionResult {
  nodesCreated?: number;
  relationshipsCreated?: number;
}

/**
 * Full-org graph rebuild — OWNER/ADMIN only, same gate as every other
 * org-wide mutation in this app (see automation/actions.ts's EDITOR_ROLES).
 */
export async function rebuildGraphAction(): Promise<RebuildGraphResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const membership = await requireActiveOrgMembership(userId);
  if (!membership) return { ok: false, error: "You don't belong to an organization yet." };
  if (!REBUILD_ROLES.has(membership.role)) {
    return { ok: false, error: "Only owners and admins can rebuild the knowledge graph." };
  }

  try {
    const result = await syncOrganizationGraph(membership.organizationId);

    await logActivity({
      organizationId: membership.organizationId,
      type: "SYSTEM_EVENT",
      description: `${session.user?.name ?? "A team member"} rebuilt the Knowledge Graph (${result.nodesCreated} new node${result.nodesCreated === 1 ? "" : "s"}, ${result.relationshipsCreated} new relationship${result.relationshipsCreated === 1 ? "" : "s"}).`,
      actorUserId: userId,
      metadata: result,
    });
    await logAudit({
      userId,
      organizationId: membership.organizationId,
      action: "knowledge_graph.rebuilt",
      metadata: result,
    });

    revalidatePath("/dashboard/knowledge-base/graph");
    return { ok: true, ...result };
  } catch (error) {
    console.error("[knowledge-graph] rebuildGraphAction failed:", error);
    return { ok: false, error: "Something went wrong rebuilding the graph. Please try again." };
  }
}
