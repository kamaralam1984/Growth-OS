import { Container } from "@/components/ui/container";
import { prisma } from "@/lib/prisma";
import { decryptMemory } from "@/lib/ai/encryption";
import { requireActiveMembership } from "../../_lib/require-membership";
import { MemoryManager, type MemoryRow, type TimelineRow, type AgentOption } from "./_components/memory-manager";

export const metadata = {
  title: "AI Memory Manager",
};

/**
 * Server page for the AI Memory Manager — real AgentMemory rows (decrypted
 * here, server-side, exactly where this app's existing pattern allows
 * decrypted display) and real AgentMemoryEvent rows for the org's Memory
 * Timeline. Mutations (pin/archive/delete/edit) are OWNER/ADMIN-only,
 * enforced in actions.ts, not here — this page renders for any active
 * member and lets the client components hide/disable privileged controls.
 */
export default async function MemoryManagerPage() {
  const { membership } = await requireActiveMembership("/dashboard/ai-command-center/memory");
  const organizationId = membership.organizationId;
  const isPrivileged = membership.role === "OWNER" || membership.role === "ADMIN";

  const [agents, memories, events] = await Promise.all([
    prisma.aIAgentInstance.findMany({
      where: { organizationId },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, type: true },
    }),
    prisma.agentMemory.findMany({
      where: { organizationId },
      orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }],
      include: { agent: { select: { name: true, type: true } } },
    }),
    prisma.agentMemoryEvent.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);

  const agentNameById = new Map(agents.map((a) => [a.id, a.name]));

  const agentOptions: AgentOption[] = agents.map((a) => ({ id: a.id, name: a.name, type: a.type }));

  const memoryRows: MemoryRow[] = memories.map((m) => ({
    id: m.id,
    agentId: m.agentId,
    agentName: m.agent.name,
    agentType: m.agent.type,
    type: m.type,
    content: decryptMemory(m.encryptedContent),
    pinned: m.pinned,
    archived: m.archivedAt !== null,
    sourceKind: m.sourceKind,
    sourceId: m.sourceId,
    createdAt: m.createdAt.toISOString(),
    updatedAt: m.updatedAt.toISOString(),
  }));

  const timelineRows: TimelineRow[] = events.map((e) => ({
    id: e.id,
    memoryId: e.memoryId,
    agentName: agentNameById.get(e.agentId) ?? "Unknown agent",
    eventType: e.eventType,
    contentSnapshot: e.contentSnapshot,
    createdAt: e.createdAt.toISOString(),
  }));

  return (
    <Container className="py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">AI Memory Manager</h1>
        <p className="text-sm text-muted-foreground">
          Every AI agent&apos;s real, encrypted-at-rest memory — meeting outcomes, won deals, paid invoices, completed
          tasks, and anything a team member adds manually. Pin what matters, archive what&apos;s stale, and trace
          every change in the Memory Timeline below.
        </p>
      </div>

      <MemoryManager agents={agentOptions} initialMemories={memoryRows} initialTimeline={timelineRows} canManage={isPrivileged} />
    </Container>
  );
}
