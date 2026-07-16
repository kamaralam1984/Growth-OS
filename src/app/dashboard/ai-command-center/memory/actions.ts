"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { storeAgentMemory } from "@/lib/ai/agent-runtime";
import { logMemoryEvent } from "@/lib/ai/memory-events";
import { decryptMemory, encryptMemory } from "@/lib/ai/encryption";
import { enqueueSourceEmbedding } from "@/lib/rag/embedding-queue";
import { deleteEmbeddings } from "@/lib/rag/vector-store";
import type { MemoryType } from "@/generated/prisma/client";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

const PRIVILEGED_ROLES = new Set(["OWNER", "ADMIN"]);
const MEMORY_PATH = "/dashboard/ai-command-center/memory";

async function requireActiveMembership(): Promise<ActionResult & { organizationId?: string; userId?: string }> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };
  const membership = await prisma.membership.findFirst({ where: { userId, status: "ACTIVE" }, orderBy: { createdAt: "asc" } });
  if (!membership) return { ok: false, error: "You don't belong to an organization yet." };
  return { ok: true, organizationId: membership.organizationId, userId };
}

async function requirePrivileged(): Promise<ActionResult & { organizationId?: string; userId?: string }> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };
  const membership = await prisma.membership.findFirst({ where: { userId, status: "ACTIVE" }, orderBy: { createdAt: "asc" } });
  if (!membership) return { ok: false, error: "You don't belong to an organization yet." };
  if (!PRIVILEGED_ROLES.has(membership.role)) return { ok: false, error: "Only owners and admins can manage agent memory." };
  return { ok: true, organizationId: membership.organizationId, userId };
}

/** Loads one AgentMemory row scoped to the org, or null if it doesn't belong here. */
async function resolveMemoryInOrg(organizationId: string, memoryId: string) {
  const memory = await prisma.agentMemory.findUnique({ where: { id: memoryId } });
  if (!memory || memory.organizationId !== organizationId) return null;
  return memory;
}

/**
 * Manual memory entry — the "Add memory manually" form on the Memory
 * Manager, open to any active member (not just OWNER/ADMIN), matching the
 * spec's "Allow users to View/Edit/Delete/Pin/Archive/Restore Memory"
 * requirement. Always tagged sourceKind: "MANUAL" since it wasn't distilled
 * from a real business event.
 */
export async function addManualMemory(input: { agentId: string; type: MemoryType; content: string }): Promise<ActionResult> {
  const access = await requireActiveMembership();
  if (!access.ok || !access.organizationId) return access;

  const content = input.content.trim();
  if (!content) return { ok: false, error: "Enter some memory content." };
  if (content.length > 4000) return { ok: false, error: "Keep memory content under 4000 characters." };

  const agent = await prisma.aIAgentInstance.findFirst({ where: { id: input.agentId, organizationId: access.organizationId } });
  if (!agent) return { ok: false, error: "Agent not found." };

  try {
    await storeAgentMemory(agent.id, access.organizationId, input.type, content, "MANUAL");
  } catch (error) {
    console.error("[memory] addManualMemory failed:", error);
    return { ok: false, error: "Something went wrong saving this memory. Please try again." };
  }

  await logAudit({ userId: access.userId, organizationId: access.organizationId, action: "agent_memory.created_manual", metadata: { agentId: agent.id, type: input.type } });
  revalidatePath(MEMORY_PATH);
  return { ok: true };
}

/**
 * Edits an existing memory's content in place: re-encrypts the new content,
 * logs an EDITED AgentMemoryEvent with the OLD (decrypted) content as
 * contentSnapshot, and re-enqueues its embedding so semantic search reflects
 * the update. OWNER/ADMIN only, matching this app's privilege pattern for
 * anything AI-configuration-adjacent (mirrors src/app/dashboard/settings/secrets).
 */
export async function editMemory(memoryId: string, newContent: string): Promise<ActionResult> {
  const access = await requirePrivileged();
  if (!access.ok || !access.organizationId) return access;

  const content = newContent.trim();
  if (!content) return { ok: false, error: "Enter some memory content." };
  if (content.length > 4000) return { ok: false, error: "Keep memory content under 4000 characters." };

  const memory = await resolveMemoryInOrg(access.organizationId, memoryId);
  if (!memory) return { ok: false, error: "Memory not found." };

  const oldContent = decryptMemory(memory.encryptedContent);

  try {
    await prisma.agentMemory.update({ where: { id: memoryId }, data: { encryptedContent: encryptMemory(content) } });
  } catch (error) {
    console.error("[memory] editMemory failed:", error);
    return { ok: false, error: "Something went wrong saving this edit. Please try again." };
  }

  await logMemoryEvent(memory.id, memory.agentId, access.organizationId, "EDITED", access.userId, oldContent);

  try {
    await enqueueSourceEmbedding(access.organizationId, "AGENT_MEMORY", memory.id, content);
  } catch (error) {
    console.error("[memory] re-embedding edited memory failed:", error);
  }

  await logAudit({ userId: access.userId, organizationId: access.organizationId, action: "agent_memory.edited", metadata: { memoryId } });
  revalidatePath(MEMORY_PATH);
  return { ok: true };
}

/** Pins/unpins a memory so it's prioritized in loadAgentMemoryContext and surfaced first in the list. OWNER/ADMIN only. */
export async function setMemoryPinned(memoryId: string, pinned: boolean): Promise<ActionResult> {
  const access = await requirePrivileged();
  if (!access.ok || !access.organizationId) return access;

  const memory = await resolveMemoryInOrg(access.organizationId, memoryId);
  if (!memory) return { ok: false, error: "Memory not found." };

  await prisma.agentMemory.update({ where: { id: memoryId }, data: { pinned } });
  await logMemoryEvent(memory.id, memory.agentId, access.organizationId, pinned ? "PINNED" : "UNPINNED", access.userId);
  await logAudit({ userId: access.userId, organizationId: access.organizationId, action: pinned ? "agent_memory.pinned" : "agent_memory.unpinned", metadata: { memoryId } });

  revalidatePath(MEMORY_PATH);
  return { ok: true };
}

/** Archives/restores a memory — archived memories are excluded from loadAgentMemoryContext but not deleted. OWNER/ADMIN only. */
export async function setMemoryArchived(memoryId: string, archived: boolean): Promise<ActionResult> {
  const access = await requirePrivileged();
  if (!access.ok || !access.organizationId) return access;

  const memory = await resolveMemoryInOrg(access.organizationId, memoryId);
  if (!memory) return { ok: false, error: "Memory not found." };

  await prisma.agentMemory.update({ where: { id: memoryId }, data: { archivedAt: archived ? new Date() : null } });
  await logMemoryEvent(memory.id, memory.agentId, access.organizationId, archived ? "ARCHIVED" : "RESTORED", access.userId);
  await logAudit({ userId: access.userId, organizationId: access.organizationId, action: archived ? "agent_memory.archived" : "agent_memory.restored", metadata: { memoryId } });

  revalidatePath(MEMORY_PATH);
  return { ok: true };
}

/**
 * Real hard delete of the AgentMemory row — not a soft-delete masquerade.
 * Logs a DELETED AgentMemoryEvent with memoryId: null (the FK is nullable
 * specifically so this history survives the row itself being gone) and the
 * memory's last known decrypted content as contentSnapshot, then removes its
 * embedding. OWNER/ADMIN only.
 */
export async function deleteMemory(memoryId: string): Promise<ActionResult> {
  const access = await requirePrivileged();
  if (!access.ok || !access.organizationId) return access;

  const memory = await resolveMemoryInOrg(access.organizationId, memoryId);
  if (!memory) return { ok: false, error: "Memory not found." };

  const content = decryptMemory(memory.encryptedContent);

  await prisma.agentMemory.delete({ where: { id: memoryId } });
  await logMemoryEvent(null, memory.agentId, access.organizationId, "DELETED", access.userId, content);

  try {
    await deleteEmbeddings("AGENT_MEMORY", memoryId);
  } catch (error) {
    console.error("[memory] deleteEmbeddings failed:", error);
  }

  await logAudit({ userId: access.userId, organizationId: access.organizationId, action: "agent_memory.deleted", metadata: { memoryId } });
  revalidatePath(MEMORY_PATH);
  return { ok: true };
}
