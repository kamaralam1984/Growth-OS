import { Gavel, Bot, AlertTriangle, FileText, Send, BrainCircuit } from "lucide-react";

import { prisma } from "@/lib/prisma";
import { Container } from "@/components/ui/container";
import { getRecentInsights } from "@/lib/ai/insights-generator";
import { AICommandBar } from "@/components/command-center/ai-command-bar";
import { ExecutiveInsights } from "@/components/command-center/executive-insights";
import { LiveAIPanel, type LiveAgentSummary } from "@/components/command-center/live-ai-panel";
import { LiveAITimeline } from "@/components/command-center/live-ai-timeline";

import { requireActiveMembership } from "../_lib/require-membership";
import { getExecutiveCardMetrics } from "../_lib/metrics";
import { MetricCard } from "../_components/metric-card";
import { ParticleField } from "../_components/particle-field";

/**
 * Dedicated, command-focused surface for the sidebar's "AI Command Center"
 * entry — distinct from the KPI-grid-heavy /dashboard page. Centerpiece is
 * a large AICommandBar for issuing natural-language commands to the AI
 * workforce (see src/lib/commands.ts's runAICommand for how those route to
 * an agent); everything below it is about watching those agents work, not
 * about revenue/pipeline reporting (that stays on /dashboard).
 *
 * Reuses the exact same data-fetching functions and components /dashboard
 * calls — no parallel query logic — just a different subset, arranged in a
 * conversational, command-bar-first layout instead of a KPI grid.
 */
export default async function AICommandCenterPage() {
  const { membership } = await requireActiveMembership("/dashboard/ai-command-center");
  const organizationId = membership.organizationId;

  const [agents, aiActivity, insights, executiveCards, activeMemoryCount] = await Promise.all([
    prisma.aIAgentInstance.findMany({
      where: { organizationId },
      orderBy: { createdAt: "asc" },
      select: { id: true, type: true, name: true, active: true, status: true, currentTask: true },
    }),
    prisma.activity.findMany({
      where: { organizationId, actorAgentId: { not: null } },
      orderBy: { createdAt: "desc" },
      take: 15,
      include: { actorAgent: { select: { name: true } } },
    }),
    getRecentInsights(organizationId),
    getExecutiveCardMetrics(organizationId),
    prisma.agentMemory.count({ where: { organizationId, archivedAt: null } }),
  ]);

  const liveAgents: LiveAgentSummary[] = agents;
  const timelineItems = aiActivity.map((a) => ({
    id: a.id,
    description: a.description,
    actorName: a.actorAgent?.name ?? null,
    createdAt: a.createdAt,
  }));

  const activeAgentsCount = agents.filter((a) => a.active).length;

  return (
    <main className="min-h-svh bg-background py-10">
      <Container className="flex flex-col gap-10">
        {/* Hero: command bar as the centerpiece */}
        <section className="relative flex flex-col items-center gap-6 overflow-hidden rounded-3xl border border-border bg-card/60 px-6 py-14 text-center shadow-card sm:px-10">
          <ParticleField className="pointer-events-none absolute inset-0 -z-10 size-full" />
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">AI Command Center</h1>
            <p className="mx-auto max-w-xl text-sm text-muted-foreground sm:text-base">
              Tell your AI workforce what to do. Every command routes to a real executive agent — no examples, no
              fabricated results.
            </p>
          </div>
          <AICommandBar className="w-full max-w-2xl" />
          <div className="grid w-full max-w-3xl grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <MetricCard icon={Bot} label="Active agents" value={`${activeAgentsCount}/${agents.length}`} href="/board" />
            <MetricCard icon={Gavel} label="Decisions pending" value={executiveCards.aiDecisionsPending} href="/board" />
            <MetricCard icon={FileText} label="Proposals ready" value={executiveCards.proposalsReady} href="/board/tasks" />
            <MetricCard icon={Send} label="Outreach ready" value={executiveCards.outreachReady} href="/board/tasks" />
            <MetricCard icon={AlertTriangle} label="Urgent tasks" value={executiveCards.urgentTasks} href="/board/tasks" />
            <MetricCard icon={BrainCircuit} label="Active memories" value={activeMemoryCount} href="/dashboard/ai-command-center/memory" />
          </div>
        </section>

        {/* Main flow: agent status cards + insights; timeline lives in a side panel */}
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1fr_360px]">
          <div className="flex min-w-0 flex-col gap-10">
            <section className="flex flex-col gap-4">
              <h2 className="text-lg font-semibold tracking-tight text-foreground">Agent Status</h2>
              <LiveAIPanel agents={liveAgents} />
            </section>

            <ExecutiveInsights initialInsights={insights} />
          </div>

          <aside className="flex min-w-0 flex-col gap-6 lg:sticky lg:top-20 lg:h-fit">
            <LiveAITimeline items={timelineItems} />
          </aside>
        </div>
      </Container>
    </main>
  );
}
