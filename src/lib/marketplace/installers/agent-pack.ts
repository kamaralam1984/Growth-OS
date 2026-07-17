import { prisma } from "@/lib/prisma";
import { getPersona } from "@/lib/ai/personas";
import type { AgentPackManifest } from "../manifest-schema";

export interface AgentPackInstallResult {
  agentInstanceId: string;
}

/**
 * Same upsert shape as ensureReviewBoardAgentsProvisioned()
 * (src/lib/ai/review-orchestrator.ts) — upsert on the real
 * @@unique([organizationId, type]) constraint, never a plain create (so
 * re-installing after an uninstall reactivates the same row rather than
 * creating a duplicate AIAgentInstance for the same type).
 */
export async function installAgentPack(organizationId: string, manifest: AgentPackManifest): Promise<AgentPackInstallResult> {
  const persona = getPersona(manifest.agentType);

  const agent = await prisma.aIAgentInstance.upsert({
    where: { organizationId_type: { organizationId, type: manifest.agentType } },
    create: {
      organizationId,
      type: manifest.agentType,
      name: persona.title,
      active: true,
      introMessage: `I'm your ${persona.title.replace(" Agent", "")} — ${persona.responsibilities.slice(0, 3).join(", ").toLowerCase()}.`,
    },
    update: { active: true },
  });

  return { agentInstanceId: agent.id };
}

/** Never deletes — preserves Task/Decision/Meeting history FKs. Same convention as every other agent deactivation in this app. */
export async function uninstallAgentPack(agentInstanceId: string): Promise<void> {
  await prisma.aIAgentInstance.update({ where: { id: agentInstanceId }, data: { active: false } });
}
