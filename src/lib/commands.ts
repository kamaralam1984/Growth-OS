import { prisma } from "@/lib/prisma";
import { runAgentTurn } from "@/lib/ai/agent-runtime";
import { EXECUTIVE_AGENT_TYPES, type ExecutiveAgentType } from "@/lib/ai/personas";

/**
 * Server-only command execution (real Prisma + AI calls). The client-safe
 * navigation command registry (`getNavigationCommands`/`CommandDefinition`)
 * lives in `@/lib/nav-commands` instead — Client Components must import it
 * from there directly, not from this file, or the bundler pulls Prisma (and
 * transitively `pg`/`dns`) into the browser bundle. See that file's top
 * comment for the full story. Re-exported here too so any *server-side*
 * caller that only needs the type/registry doesn't need a second import.
 */
export { getNavigationCommands, type CommandDefinition } from "@/lib/nav-commands";

export interface AICommandResult {
  content: string;
}

/**
 * Keyword routing rule for runAICommand, checked in this order (first match
 * wins) against the lower-cased command text:
 *   - "proposal" / "quote" / "quotation" / "scope" / "nda" / "sow"           -> PROPOSAL
 *   - "lead" / "crm" / "sales" / "pipeline" / "deal" / "prospect"           -> SALES
 *   - "linkedin" / "email" / "outreach" / "cold email" / "follow up/-up"   -> OUTREACH
 *   - "marketing" / "campaign" / "content" / "seo" / "social" / "ad copy"  -> MARKETING
 *   - anything else                                                        -> CEO (default)
 */
const ROUTING_RULES: ReadonlyArray<{ agentType: ExecutiveAgentType; keywords: string[] }> = [
  { agentType: "PROPOSAL", keywords: ["proposal", "quote", "quotation", "scope", "nda", "sow"] },
  { agentType: "SALES", keywords: ["lead", "crm", "sales", "pipeline", "deal", "prospect"] },
  { agentType: "OUTREACH", keywords: ["linkedin", "email", "outreach", "cold email", "follow up", "follow-up"] },
  { agentType: "MARKETING", keywords: ["marketing", "campaign", "content", "seo", "social", "ad copy"] },
];

function routeCommandToAgentType(commandText: string): ExecutiveAgentType {
  const lower = commandText.toLowerCase();
  for (const rule of ROUTING_RULES) {
    if (rule.keywords.some((kw) => lower.includes(kw))) return rule.agentType;
  }
  return "CEO";
}

/**
 * Routes a natural-language AI Command Bar command to a real `runAgentTurn`
 * call and returns its text response. Never fabricates a result — if AI
 * isn't connected or the account has no credit, this throws
 * AINotConnectedError / a billing error exactly like runAgentTurn does, and
 * the caller (a Server Action) must handle both distinctly (see the
 * `describeAIError` pattern in src/app/board/tasks/actions.ts).
 *
 * `agentId` handling (a documented interpretation of the brief, which lists
 * `agentId` as a plain parameter while also asking this function to do the
 * agent *selection* via keyword routing): `agentId` is treated as an
 * optional hint, not a hard requirement.
 *   - If it's provided and resolves to a real, active AIAgentInstance in
 *     this organization, that exact agent handles the command directly
 *     (e.g. the user is already inside that agent's chat/detail view).
 *   - Otherwise, the command text is keyword-routed (see ROUTING_RULES
 *     above) to an agent type, and the org's active agent of that type
 *     handles it.
 *   - If routing picks a type the org has no active agent for, this falls
 *     back to the org's CEO agent.
 *   - If the org has no active agent at all, this throws a clear error
 *     rather than silently no-op'ing or fabricating a response.
 *
 * For commands implying a capability this app doesn't actually have (live
 * web search for lead-finding, fetching a real company website) — no
 * `web_search` tool is wired here, so this deliberately does NOT tell the
 * agent it has performed a search/fetch. The routed agent is simply given
 * the raw command text and reasons/drafts from its training + the org data
 * already in its memory context (via runAgentTurn's own memory loading) —
 * it is expected to answer honestly with what it has, not claim to have
 * browsed the web.
 */
export async function runAICommand(
  organizationId: string,
  agentId: string | null | undefined,
  commandText: string,
): Promise<AICommandResult> {
  const task = commandText.trim();
  if (!task) throw new Error("Command text is required.");

  let agent = agentId
    ? await prisma.aIAgentInstance.findFirst({ where: { id: agentId, organizationId, active: true } })
    : null;

  if (!agent) {
    const routedType = routeCommandToAgentType(task);
    agent = await prisma.aIAgentInstance.findFirst({
      where: { organizationId, type: routedType, active: true },
    });
  }

  if (!agent) {
    agent = await prisma.aIAgentInstance.findFirst({
      where: { organizationId, type: "CEO", active: true },
    });
  }

  if (!agent) {
    throw new Error("No active AI agent is available in this organization to run that command.");
  }

  if (!EXECUTIVE_AGENT_TYPES.includes(agent.type as ExecutiveAgentType)) {
    throw new Error(`Agent type "${agent.type}" doesn't have a runnable persona yet.`);
  }

  const result = await runAgentTurn({
    agentId: agent.id,
    agentType: agent.type as ExecutiveAgentType,
    agentName: agent.name,
    task,
  });

  return { content: result.content };
}
