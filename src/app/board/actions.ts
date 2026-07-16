"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { logActivity } from "@/lib/activity";
import { createAgentGoalSchema } from "@/lib/validations/board";
import type { AIAgentInstance, MembershipRole } from "@/generated/prisma/client";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

// Judgment call: pausing/resuming an agent and setting its goal changes how
// the AI workforce behaves org-wide, so — mirroring the company-profile
// pattern (OWNER/ADMIN can edit, everyone else is read-only) — only
// OWNER/ADMIN members may mutate the board. Other roles can still view it.
const BOARD_EDITOR_ROLES = new Set<MembershipRole>(["OWNER", "ADMIN"]);

const agentIdSchema = z.string().trim().min(1, "An agent is required.");

type EditorCheckResult =
  | { ok: true; agent: AIAgentInstance }
  | { ok: false; error: string };

/**
 * Confirms the signed-in user is an OWNER/ADMIN of the organization that owns
 * `agentId` before any board mutation. Looks the agent up itself rather than
 * trusting a client-supplied organizationId, per the "derive identity from
 * the session, look up by ownership" pattern.
 */
async function requireBoardEditor(agentId: string, userId: string): Promise<EditorCheckResult> {
  const agent = await prisma.aIAgentInstance.findUnique({ where: { id: agentId } });
  if (!agent) return { ok: false, error: "Agent not found." };

  const membership = await prisma.membership.findUnique({
    where: { userId_organizationId: { userId, organizationId: agent.organizationId } },
  });
  if (!membership || membership.status !== "ACTIVE") {
    return { ok: false, error: "You do not have access to this organization." };
  }
  if (!BOARD_EDITOR_ROLES.has(membership.role)) {
    return { ok: false, error: "Only owners and admins can manage the AI executive board." };
  }

  return { ok: true, agent };
}

/**
 * Pauses or resumes an AI agent (toggles AIAgentInstance.active). Pausing
 * also resets the live-status fields to IDLE/no-task so a paused agent never
 * shows a stale "Thinking..." state.
 */
export async function toggleAgentActive(agentId: string): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const parsedId = agentIdSchema.safeParse(agentId);
  if (!parsedId.success) return { ok: false, error: "Invalid agent." };

  const access = await requireBoardEditor(parsedId.data, userId);
  if (!access.ok) return access;
  const { agent } = access;

  const nextActive = !agent.active;

  try {
    await prisma.aIAgentInstance.update({
      where: { id: agent.id },
      data: {
        active: nextActive,
        ...(nextActive ? {} : { status: "IDLE", currentTask: null }),
      },
    });

    await logAudit({
      userId,
      organizationId: agent.organizationId,
      action: nextActive ? "board.agent_resumed" : "board.agent_paused",
      metadata: { agentId: agent.id, agentType: agent.type },
    });

    await logActivity({
      organizationId: agent.organizationId,
      type: "SYSTEM_EVENT",
      description: `${agent.name} was ${nextActive ? "resumed" : "paused"} by a board member.`,
      actorUserId: userId,
      metadata: { agentId: agent.id, agentType: agent.type },
    });

    revalidatePath("/board");
    return { ok: true };
  } catch (error) {
    console.error("[board] toggleAgentActive failed:", error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

/**
 * Sets an agent's currentGoal — the standing objective it works toward
 * across tasks and meetings, shown on its Executive Board card.
 */
export async function setAgentGoal(agentId: string, goal: string): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const parsed = createAgentGoalSchema.safeParse({ agentId, goal });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please provide a valid goal." };
  }

  const access = await requireBoardEditor(parsed.data.agentId, userId);
  if (!access.ok) return access;
  const { agent } = access;

  try {
    await prisma.aIAgentInstance.update({
      where: { id: agent.id },
      data: { currentGoal: parsed.data.goal },
    });

    await logAudit({
      userId,
      organizationId: agent.organizationId,
      action: "board.agent_goal_set",
      metadata: { agentId: agent.id, agentType: agent.type },
    });

    await logActivity({
      organizationId: agent.organizationId,
      type: "SYSTEM_EVENT",
      description: `New goal set for ${agent.name}: "${parsed.data.goal}"`,
      actorUserId: userId,
      metadata: { agentId: agent.id, agentType: agent.type },
    });

    revalidatePath("/board");
    return { ok: true };
  } catch (error) {
    console.error("[board] setAgentGoal failed:", error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}
