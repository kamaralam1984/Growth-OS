"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { checkRateLimit } from "@/lib/rate-limit";
import { AINotConnectedError, AIBillingError, isAIBillingError } from "@/lib/ai/client";
import { globalSearch, type SearchResult } from "@/lib/search";
import { runAICommand } from "@/lib/commands";
import { runAgentTurn } from "@/lib/ai/agent-runtime";
import { createMeeting } from "@/app/board/meetings/actions";

/**
 * Shared org-membership resolution for every Command Center Server Action
 * below. Mirrors the pattern in src/app/board/tasks/actions.ts: the caller
 * only ever supplies free text (a query / a command string) — identity and
 * organization are always derived from the session, never trusted from the
 * client.
 */
async function requireActiveMembership() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { userId: null as never, organizationId: null, error: "You must be signed in." } as const;

  const membership = await prisma.membership.findFirst({
    where: { userId, status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
  });
  if (!membership) {
    return { userId, organizationId: null, error: "You don't belong to an organization yet." } as const;
  }

  return { userId, organizationId: membership.organizationId, error: null } as const;
}

export interface SearchActionResult {
  ok: boolean;
  results: SearchResult[];
  error?: string;
}

/**
 * Server Action wrapping src/lib/search.ts's globalSearch — used by both
 * the Command Palette's live results section and the standalone Global
 * Search component (via useCommandSearch, the shared hook both consume).
 */
export async function searchCommandCenter(query: string): Promise<SearchActionResult> {
  const { organizationId, error } = await requireActiveMembership();
  if (!organizationId) return { ok: false, results: [], error: error ?? "Not authorized." };

  const trimmed = query.trim();
  if (trimmed.length < 2) return { ok: true, results: [] };

  try {
    const results = await globalSearch(organizationId, trimmed);
    return { ok: true, results };
  } catch (err) {
    console.error("[command-center] search failed:", err);
    return { ok: false, results: [], error: "Search failed. Please try again." };
  }
}

export interface AICommandActionResult {
  ok: boolean;
  content?: string;
  error?: string;
  errorKind?: "not_connected" | "billing" | "generic";
}

/** Same honest-error shape used across board/tasks/actions.ts. */
function describeAICommandError(error: unknown): AICommandActionResult {
  if (error instanceof AINotConnectedError) {
    return {
      ok: false,
      errorKind: "not_connected",
      error: "AI is not connected — no ANTHROPIC_API_KEY is configured for this environment.",
    };
  }
  if (error instanceof AIBillingError || isAIBillingError(error)) {
    return {
      ok: false,
      errorKind: "billing",
      error: "AI is connected but the account has no API credits — add credits at console.anthropic.com/settings/billing.",
    };
  }
  console.error("[command-center] AI command failed:", error);
  return { ok: false, errorKind: "generic", error: "Something went wrong running that command. Please try again." };
}

/**
 * Server Action wrapping src/lib/commands.ts's runAICommand — used by the
 * Command Palette's "Ask AI: '<query>'" item and the standalone AI Command
 * Bar. This is a real, billable Claude call, so it's rate-limited per user
 * in addition to the auth + membership check every action here performs.
 */
export async function runAICommandBar(commandText: string): Promise<AICommandActionResult> {
  const { userId, organizationId, error } = await requireActiveMembership();
  if (!organizationId || !userId) return { ok: false, errorKind: "generic", error: error ?? "Not authorized." };

  const trimmed = commandText.trim();
  if (!trimmed) return { ok: false, errorKind: "generic", error: "Type a command first." };

  if (!checkRateLimit(`ai-command-bar:${userId}`, { limit: 20, windowMs: 5 * 60_000 }).allowed) {
    return { ok: false, errorKind: "generic", error: "Too many AI commands requested — wait a few minutes and try again." };
  }

  try {
    const result = await runAICommand(organizationId, null, trimmed);
    await logAudit({
      userId,
      organizationId,
      action: "command_center.ai_command_run",
      metadata: { commandText: trimmed },
    });
    return { ok: true, content: result.content };
  } catch (err) {
    return describeAICommandError(err);
  }
}

/**
 * Quick Actions' "Start AI Meeting" — a real Claude call (CEO agent) drafts
 * a short agenda from the ask, then reuses the exact same createMeeting()
 * board/meetings/actions.ts already uses, so it seats agents and redirects
 * to the live meeting room identically to starting one manually.
 */
export async function startAIMeeting(topic: string): Promise<AICommandActionResult> {
  const { userId, organizationId, error } = await requireActiveMembership();
  if (!organizationId || !userId) return { ok: false, errorKind: "generic", error: error ?? "Not authorized." };

  const trimmedTopic = topic.trim();
  if (!trimmedTopic) return { ok: false, errorKind: "generic", error: "Give the meeting a topic first." };

  if (!checkRateLimit(`start-ai-meeting:${userId}`, { limit: 10, windowMs: 5 * 60_000 }).allowed) {
    return { ok: false, errorKind: "generic", error: "Too many meetings requested — wait a few minutes and try again." };
  }

  const ceoAgent = await prisma.aIAgentInstance.findUnique({
    where: { organizationId_type: { organizationId, type: "CEO" } },
  });
  if (!ceoAgent) return { ok: false, errorKind: "generic", error: "Your CEO agent isn't set up yet." };

  let agenda: string;
  try {
    const turn = await runAgentTurn({
      agentId: ceoAgent.id,
      agentType: "CEO",
      agentName: ceoAgent.name,
      task: `Draft a short, concrete agenda (3-5 bullet points, plain text) for an ad-hoc AI Executive Board meeting about: "${trimmedTopic}". Output only the agenda text, no preamble.`,
      effort: "low",
      organizationId,
      contextQuery: trimmedTopic,
    });
    agenda = turn.content;
  } catch (err) {
    return describeAICommandError(err);
  }

  // Deliberately outside the try/catch above: createMeeting() redirects via
  // Next.js's throw-based redirect() on success, which a catch block here
  // would otherwise swallow and misreport as a generic AI error. It only
  // returns normally (instead of redirecting) when it failed.
  const meetingResult = await createMeeting({ title: trimmedTopic.slice(0, 120), agenda });
  return { ok: false, errorKind: "generic", error: meetingResult.error ?? "Could not start the meeting." };
}
