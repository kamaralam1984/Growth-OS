import { prisma } from "@/lib/prisma";
import type { GraphEntityType, KnowledgeGraphNode, Relationship, RelationshipType, Prisma } from "@/generated/prisma/client";

/**
 * Real Knowledge Graph builder — every node/edge below is derived from a
 * genuine row in another table (Deal, Project, Meeting, Task,
 * KnowledgeArticle, Company, Client, Contact, User). Nothing here ever
 * fabricates a node or a relationship; if a real foreign key is null, the
 * corresponding edge is simply skipped.
 *
 * `GraphEntityType` has no dedicated value for the CRM `Contact` model (only
 * CLIENT, which otherwise backs the separate `Client` model used by
 * Project.clientId). Rather than silently dropping real Contact-linked edges
 * (e.g. Deal.contactId), we file Contact rows under CLIENT too and stamp
 * `metadata.sourceModel: "Contact"` so a real Client row and a real Contact
 * row are never confused with each other downstream (their `entityId`s come
 * from different tables and are cuids, so no collision risk in practice).
 */

// Caps each entity type's backfill pass in syncOrganizationGraph so a full
// resync stays fast even for a very large org — the 500 most-recently
// created rows of each type are (re)synced per run; older rows simply wait
// for a future run once newer ones roll off. This is a documented,
// deliberate truncation, not a silent one.
const BACKFILL_LIMIT = 500;

function employeeLabel(user: { name: string | null; email: string | null } | null | undefined): string {
  if (!user) return "Unknown user";
  return user.name ?? user.email ?? "Unknown user";
}

function contactLabel(contact: { firstName: string; lastName: string | null } | null | undefined): string {
  if (!contact) return "Unknown contact";
  return [contact.firstName, contact.lastName].filter(Boolean).join(" ") || "Unknown contact";
}

/**
 * Upserts one real graph node on the unique `[organizationId, entityType,
 * entityId]` triple. `entityId` must be the real id of the underlying
 * record (a real Deal.id, Company.id, etc) — never a synthetic value.
 */
export async function upsertGraphNode(
  organizationId: string,
  entityType: GraphEntityType,
  entityId: string,
  label: string,
  metadata?: Prisma.InputJsonValue,
): Promise<KnowledgeGraphNode> {
  return prisma.knowledgeGraphNode.upsert({
    where: { organizationId_entityType_entityId: { organizationId, entityType, entityId } },
    create: { organizationId, entityType, entityId, label, metadata: metadata ?? undefined },
    update: { label, metadata: metadata ?? undefined },
  });
}

/**
 * Upserts one real relationship between two already-upserted graph nodes.
 * `Relationship` has no natural unique constraint, so this checks for an
 * existing row on `{organizationId, fromNodeId, toNodeId, type}` first and
 * updates it in place; otherwise it creates a new one.
 */
export async function upsertRelationship(
  organizationId: string,
  fromNode: KnowledgeGraphNode,
  toNode: KnowledgeGraphNode,
  type: RelationshipType,
  weight?: number,
  metadata?: Prisma.InputJsonValue,
): Promise<Relationship> {
  const existing = await prisma.relationship.findFirst({
    where: { organizationId, fromNodeId: fromNode.id, toNodeId: toNode.id, type },
  });

  if (existing) {
    return prisma.relationship.update({
      where: { id: existing.id },
      data: {
        weight: weight ?? undefined,
        metadata: metadata ?? undefined,
      },
    });
  }

  return prisma.relationship.create({
    data: {
      organizationId,
      fromNodeId: fromNode.id,
      toNodeId: toNode.id,
      type,
      weight: weight ?? 1,
      metadata: metadata ?? undefined,
    },
  });
}

async function syncDeals(organizationId: string): Promise<void> {
  const deals = await prisma.deal.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    take: BACKFILL_LIMIT,
    select: {
      id: true,
      name: true,
      company: { select: { id: true, name: true } },
      contact: { select: { id: true, firstName: true, lastName: true } },
      owner: { select: { id: true, name: true, email: true } },
    },
  });

  for (const deal of deals) {
    const dealNode = await upsertGraphNode(organizationId, "DEAL", deal.id, deal.name);

    if (deal.company) {
      const companyNode = await upsertGraphNode(organizationId, "COMPANY", deal.company.id, deal.company.name);
      await upsertRelationship(organizationId, dealNode, companyNode, "BELONGS_TO");
    }

    if (deal.owner) {
      const ownerNode = await upsertGraphNode(organizationId, "EMPLOYEE", deal.owner.id, employeeLabel(deal.owner));
      await upsertRelationship(organizationId, ownerNode, dealNode, "OWNS");
    }

    if (deal.contact) {
      const contactNode = await upsertGraphNode(organizationId, "CLIENT", deal.contact.id, contactLabel(deal.contact), {
        sourceModel: "Contact",
      });
      await upsertRelationship(organizationId, dealNode, contactNode, "RELATED_TO");
    }
  }
}

async function syncProjects(organizationId: string): Promise<void> {
  const projects = await prisma.project.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    take: BACKFILL_LIMIT,
    select: {
      id: true,
      name: true,
      company: { select: { id: true, name: true } },
      client: { select: { id: true, name: true } },
      owner: { select: { id: true, name: true, email: true } },
    },
  });

  for (const project of projects) {
    const projectNode = await upsertGraphNode(organizationId, "PROJECT", project.id, project.name);

    if (project.company) {
      const companyNode = await upsertGraphNode(organizationId, "COMPANY", project.company.id, project.company.name);
      await upsertRelationship(organizationId, projectNode, companyNode, "BELONGS_TO");
    }

    if (project.client) {
      const clientNode = await upsertGraphNode(organizationId, "CLIENT", project.client.id, project.client.name, {
        sourceModel: "Client",
      });
      await upsertRelationship(organizationId, projectNode, clientNode, "BELONGS_TO");
    }

    if (project.owner) {
      const ownerNode = await upsertGraphNode(organizationId, "EMPLOYEE", project.owner.id, employeeLabel(project.owner));
      await upsertRelationship(organizationId, ownerNode, projectNode, "OWNS");
    }
  }
}

async function syncMeetings(organizationId: string): Promise<void> {
  const meetings = await prisma.meeting.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    take: BACKFILL_LIMIT,
    select: {
      id: true,
      title: true,
      participants: { select: { userId: true, user: { select: { id: true, name: true, email: true } } } },
    },
  });

  for (const meeting of meetings) {
    const meetingNode = await upsertGraphNode(organizationId, "MEETING", meeting.id, meeting.title);

    for (const participant of meeting.participants) {
      // Agent participants are skipped — GraphEntityType has no AI-agent
      // value, and an AIAgentInstance is not a real EMPLOYEE.
      if (!participant.userId || !participant.user) continue;
      const employeeNode = await upsertGraphNode(organizationId, "EMPLOYEE", participant.user.id, employeeLabel(participant.user));
      await upsertRelationship(organizationId, employeeNode, meetingNode, "ATTENDED");
    }
  }
}

async function syncTasks(organizationId: string): Promise<void> {
  const tasks = await prisma.task.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    take: BACKFILL_LIMIT,
    select: {
      id: true,
      title: true,
      assignedToUser: { select: { id: true, name: true, email: true } },
      deal: { select: { id: true, name: true } },
      company: { select: { id: true, name: true } },
    },
  });

  for (const task of tasks) {
    const taskNode = await upsertGraphNode(organizationId, "TASK", task.id, task.title);

    // Agent assignees are skipped for the same reason as meeting participants.
    if (task.assignedToUser) {
      const employeeNode = await upsertGraphNode(organizationId, "EMPLOYEE", task.assignedToUser.id, employeeLabel(task.assignedToUser));
      await upsertRelationship(organizationId, taskNode, employeeNode, "ASSIGNED_TO");
    }

    if (task.deal) {
      const dealNode = await upsertGraphNode(organizationId, "DEAL", task.deal.id, task.deal.name);
      await upsertRelationship(organizationId, taskNode, dealNode, "RELATED_TO");
    } else if (task.company) {
      const companyNode = await upsertGraphNode(organizationId, "COMPANY", task.company.id, task.company.name);
      await upsertRelationship(organizationId, taskNode, companyNode, "RELATED_TO");
    }
  }
}

async function syncKnowledgeArticles(organizationId: string): Promise<void> {
  const articles = await prisma.knowledgeArticle.findMany({
    where: { knowledgeBase: { workspace: { organizationId } } },
    orderBy: { createdAt: "desc" },
    take: BACKFILL_LIMIT,
    select: {
      id: true,
      title: true,
      createdByUser: { select: { id: true, name: true, email: true } },
    },
  });

  for (const article of articles) {
    const articleNode = await upsertGraphNode(organizationId, "KNOWLEDGE_ARTICLE", article.id, article.title);

    if (article.createdByUser) {
      const employeeNode = await upsertGraphNode(organizationId, "EMPLOYEE", article.createdByUser.id, employeeLabel(article.createdByUser));
      await upsertRelationship(organizationId, employeeNode, articleNode, "AUTHORED");
    }
  }
}

/**
 * Real, idempotent full-org backfill of the Knowledge Graph. Builds nodes
 * and edges strictly from real Deal/Project/Meeting/Task/KnowledgeArticle
 * rows (plus the Company/Client/Contact/User rows they reference) — see the
 * per-entity sync functions above for exactly which real relations back
 * each edge.
 *
 * AI_DECISION, DOCUMENT, and EMAIL entity types are intentionally left
 * unbacked in this pass: there is no single clean, unambiguous source model
 * to back them within scope (Decision rows exist but a decision-to-meeting
 * DECIDED_IN edge and a document/email graph would need their own careful
 * design), so rather than fabricate a placeholder node/edge, they're simply
 * not synced. Add a dedicated sync function above (following the same
 * pattern) when a real source is ready.
 *
 * Returns how many real KnowledgeGraphNode/Relationship rows this run
 * actually added, computed from before/after counts — safe because this
 * function only ever creates or updates existing rows, never deletes.
 */
export async function syncOrganizationGraph(organizationId: string): Promise<{ nodesCreated: number; relationshipsCreated: number }> {
  const [nodesBefore, relationshipsBefore] = await Promise.all([
    prisma.knowledgeGraphNode.count({ where: { organizationId } }),
    prisma.relationship.count({ where: { organizationId } }),
  ]);

  await syncDeals(organizationId);
  await syncProjects(organizationId);
  await syncMeetings(organizationId);
  await syncTasks(organizationId);
  await syncKnowledgeArticles(organizationId);

  const [nodesAfter, relationshipsAfter] = await Promise.all([
    prisma.knowledgeGraphNode.count({ where: { organizationId } }),
    prisma.relationship.count({ where: { organizationId } }),
  ]);

  return {
    nodesCreated: nodesAfter - nodesBefore,
    relationshipsCreated: relationshipsAfter - relationshipsBefore,
  };
}

// Hard cap on how many nodes a single neighborhood traversal will ever
// return — this is meant to feed a focused subgraph view, not render an
// entire org's graph, so BFS stops expanding once this many nodes have been
// visited even if `depth` hasn't been fully explored yet.
const MAX_NEIGHBORHOOD_NODES = 200;

/**
 * Real BFS traversal outward from one real graph node, out to `depth` hops,
 * for rendering a focused subgraph. Returns an empty result (not an error)
 * if the requested node doesn't exist in the graph yet — callers should
 * treat that as "run a sync first", not a failure.
 */
export async function getNodeNeighborhood(
  organizationId: string,
  entityType: GraphEntityType,
  entityId: string,
  depth = 1,
): Promise<{ nodes: KnowledgeGraphNode[]; relationships: Relationship[] }> {
  const center = await prisma.knowledgeGraphNode.findUnique({
    where: { organizationId_entityType_entityId: { organizationId, entityType, entityId } },
  });
  if (!center) return { nodes: [], relationships: [] };

  const nodesById = new Map<string, KnowledgeGraphNode>([[center.id, center]]);
  const relationshipsById = new Map<string, Relationship>();

  let frontier = [center.id];
  for (let hop = 0; hop < depth && frontier.length > 0 && nodesById.size < MAX_NEIGHBORHOOD_NODES; hop++) {
    const relationships = await prisma.relationship.findMany({
      where: {
        organizationId,
        OR: [{ fromNodeId: { in: frontier } }, { toNodeId: { in: frontier } }],
      },
      include: { fromNode: true, toNode: true },
    });

    const nextFrontier: string[] = [];
    for (const relationship of relationships) {
      relationshipsById.set(relationship.id, relationship);
      for (const node of [relationship.fromNode, relationship.toNode]) {
        if (!nodesById.has(node.id) && nodesById.size < MAX_NEIGHBORHOOD_NODES) {
          nodesById.set(node.id, node);
          nextFrontier.push(node.id);
        }
      }
    }
    frontier = nextFrontier;
  }

  return { nodes: Array.from(nodesById.values()), relationships: Array.from(relationshipsById.values()) };
}
