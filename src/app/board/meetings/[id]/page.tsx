import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Container } from "@/components/ui/container";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { EXECUTIVE_AGENT_TYPES } from "@/lib/ai/personas";
import { deriveTrackedActionItemFields } from "@/lib/validations/action-items";
import { getRevenueForecast } from "@/lib/revenue/forecast";
import type { MeetingStatus } from "@/generated/prisma/client";

import { AgentSeat, type WarRoomAgentSeat } from "./_components/agent-seat";
import { HumanSeat, type WarRoomHumanSeat } from "./_components/human-seat";
import { LiveStatsStrip } from "./_components/live-stats-strip";
import { OwnerControls } from "./_components/owner-controls";
import { LiveDiscussion, type WarRoomMessage } from "./_components/live-discussion";
import { DecisionBoard, type WarRoomDecision } from "./_components/decision-board";
import { TaskBoard, type WarRoomTask } from "./_components/task-board";
import { MeetingNotes, type StructuredMeetingNotes } from "./_components/meeting-notes";
import { TrackActionItemRow } from "./_components/track-action-item-row";
import { StructuredActionItemCard } from "./_components/structured-action-item-card";
import { WarRoomTimeline, type TimelineEntry } from "./_components/war-room-timeline";
import { ProposeDecisionForm } from "./_components/propose-decision-form";
import { RealtimeToast } from "./_components/realtime-toast";

const STATUS_BADGE: Record<MeetingStatus, { label: string; variant: "default" | "secondary" | "outline" | "accent" }> = {
  SCHEDULED: { label: "Scheduled", variant: "outline" },
  LIVE: { label: "Live", variant: "accent" },
  PAUSED: { label: "Paused", variant: "secondary" },
  COMPLETED: { label: "Completed", variant: "secondary" },
  CANCELLED: { label: "Cancelled", variant: "outline" },
};

const MESSAGE_TYPE_LABEL: Record<string, string> = {
  DISCUSSION: "spoke",
  SUGGESTION: "suggested",
  VOTE: "voted",
  DECISION: "decided",
  ACTION_ITEM: "assigned an action item",
  SUMMARY: "summarized the meeting",
};

function isStructuredNotes(value: unknown): value is StructuredMeetingNotes {
  return (
    !!value &&
    typeof value === "object" &&
    "summary" in value &&
    "actionItems" in value &&
    "risks" in value &&
    "recommendations" in value &&
    "nextSteps" in value
  );
}

export default async function WarRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/login?callbackUrl=%2Fboard%2Fmeetings%2F${id}`);
  }
  const userId = session.user.id;

  const meeting = await prisma.meeting.findUnique({
    where: { id },
    include: {
      createdBy: { select: { id: true, name: true } },
      organization: { select: { currency: true } },
      relatedLead: { select: { id: true, name: true, company: true, estimatedValue: true } },
      participants: {
        include: {
          agent: {
            select: { id: true, type: true, name: true, status: true, currentTask: true, confidenceScore: true },
          },
          user: { select: { id: true, name: true } },
        },
      },
      messages: {
        orderBy: { createdAt: "asc" },
        include: {
          senderAgent: { select: { id: true, name: true, type: true } },
          senderUser: { select: { id: true, name: true } },
        },
      },
      decisions: {
        orderBy: { createdAt: "desc" },
        include: {
          votes: { include: { agent: { select: { name: true } } } },
        },
      },
      tasks: {
        orderBy: { createdAt: "asc" },
        include: {
          assignedToAgent: { select: { name: true } },
          assignedToUser: { select: { name: true } },
        },
      },
    },
  });

  if (!meeting) notFound();

  const membership = await prisma.membership.findUnique({
    where: { userId_organizationId: { userId, organizationId: meeting.organizationId } },
  });
  if (!membership || membership.status !== "ACTIVE") {
    redirect("/board/meetings");
  }

  const canManage = membership.role === "OWNER" || membership.role === "ADMIN";
  const status = STATUS_BADGE[meeting.status];

  const agentParticipants = meeting.participants
    .map((p) => p.agent)
    .filter((agent): agent is NonNullable<typeof agent> => agent !== null);
  const userParticipants = meeting.participants
    .map((p) => p.user)
    .filter((user): user is NonNullable<typeof user> => user !== null);

  const agentIds = agentParticipants.map((a) => a.id);
  const [memoryGroups, leads, orgAgents, orgMemberships, participantMemberships, trackedActionItems, revenueForecast] = await Promise.all([
    agentIds.length > 0
      ? prisma.agentMemory.groupBy({
          by: ["agentId"],
          where: { agentId: { in: agentIds } },
          _count: { _all: true },
          _max: { updatedAt: true },
        })
      : Promise.resolve([]),
    prisma.lead.findMany({
      where: { pipelineStage: { workspace: { organizationId: meeting.organizationId } } },
      select: { id: true, name: true, company: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.aIAgentInstance.findMany({
      where: { organizationId: meeting.organizationId, active: true, type: { in: EXECUTIVE_AGENT_TYPES } },
      select: { id: true, name: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.membership.findMany({
      where: { organizationId: meeting.organizationId, status: "ACTIVE" },
      select: { user: { select: { id: true, name: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.membership.findMany({
      where: { organizationId: meeting.organizationId, userId: { in: userParticipants.map((u) => u.id) } },
      select: { userId: true, role: true },
    }),
    prisma.actionItem.findMany({
      where: { meetingId: meeting.id },
      select: { id: true, title: true, taskId: true, dueDate: true },
    }),
    getRevenueForecast(meeting.organizationId, "month"),
  ]);
  const memoryByAgent = new Map(memoryGroups.map((g) => [g.agentId, { count: g._count._all, updatedAt: g._max.updatedAt }]));
  const roleByUserId = new Map(participantMemberships.map((m) => [m.userId, m.role]));
  const trackedTitles = new Set(trackedActionItems.map((a) => a.title));
  // Correlates a structured notesJson.actionItems entry back to the real
  // ActionItem row generateMeetingSummary created for it (same convention
  // trackedTitles already uses for legacy narrative items) — lets the UI
  // offer a real "Promote to task" button without a second lookup id.
  const actionItemByTitle = new Map(trackedActionItems.map((a) => [a.title, a]));

  const agentSeats: WarRoomAgentSeat[] = agentParticipants.map((agent) => ({
    id: agent.id,
    type: agent.type,
    name: agent.name,
    status: agent.status,
    currentTask: agent.currentTask,
    confidenceScore: agent.confidenceScore,
    memoryCount: memoryByAgent.get(agent.id)?.count ?? 0,
    memoryUpdatedAt: memoryByAgent.get(agent.id)?.updatedAt?.toISOString() ?? null,
  }));

  const humanSeats: WarRoomHumanSeat[] = userParticipants.map((user) => ({
    id: user.id,
    name: user.name,
    roleLabel: roleByUserId.get(user.id) === "OWNER" ? "Company Owner" : roleByUserId.get(user.id) === "ADMIN" ? "Admin" : "Team Member",
    isYou: user.id === userId,
  }));

  const discussionMessages: WarRoomMessage[] = meeting.messages.map((m) => ({
    id: m.id,
    type: m.type,
    content: m.content,
    createdAt: m.createdAt.toISOString(),
    priority: m.priority,
    confidenceScore: m.confidenceScore,
    suggestedAction: m.suggestedAction,
    evidence: m.evidence,
    senderAgent: m.senderAgent,
    senderUser: m.senderUser,
  }));

  const decisions: WarRoomDecision[] = meeting.decisions.map((d) => ({
    id: d.id,
    topic: d.topic,
    description: d.description,
    category: d.category,
    status: d.status,
    riskLevel: d.riskLevel,
    financialImpact: d.financialImpact,
    votes: d.votes.map((v) => ({ vote: v.vote, agentName: v.agent.name, reasoning: v.reasoning })),
  }));

  const tasks: WarRoomTask[] = meeting.tasks.map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    priority: t.priority,
    progress: t.progress,
    dueDate: t.dueDate ? t.dueDate.toISOString() : null,
    ownerName: t.assignedToAgent?.name ?? t.assignedToUser?.name ?? "Unassigned",
    isAgent: Boolean(t.assignedToAgent),
    kpi: t.kpi,
    expectedImpact: t.expectedImpact,
  }));

  const timelineEntries: TimelineEntry[] = [];
  if (meeting.startedAt) {
    timelineEntries.push({ id: "started", kind: "started", label: "Meeting started", timestamp: meeting.startedAt.toISOString() });
  }
  for (const m of meeting.messages) {
    const name = m.senderAgent?.name ?? m.senderUser?.name ?? "Someone";
    timelineEntries.push({
      id: `msg-${m.id}`,
      kind: "message",
      label: `${name} ${MESSAGE_TYPE_LABEL[m.type] ?? "spoke"}`,
      detail: m.content.slice(0, 90),
      timestamp: m.createdAt.toISOString(),
    });
  }
  for (const d of meeting.decisions) {
    timelineEntries.push({
      id: `dec-${d.id}`,
      kind: "decision_proposed",
      label: `Decision proposed: ${d.topic}`,
      timestamp: d.createdAt.toISOString(),
    });
    for (const v of d.votes) {
      timelineEntries.push({
        id: `vote-${d.id}-${v.agent.name}`,
        kind: "vote",
        label: `${v.agent.name} voted ${v.vote} on "${d.topic}"`,
        timestamp: d.createdAt.toISOString(),
      });
    }
    if (d.finalizedAt) {
      timelineEntries.push({
        id: `dec-final-${d.id}`,
        kind: "decision_finalized",
        label: `Decision finalized: ${d.topic} — ${d.status}`,
        timestamp: d.finalizedAt.toISOString(),
      });
    }
  }
  for (const t of meeting.tasks) {
    timelineEntries.push({
      id: `task-${t.id}`,
      kind: "task_created",
      label: `Task created: ${t.title}`,
      timestamp: t.createdAt.toISOString(),
    });
  }
  if (meeting.endedAt) {
    timelineEntries.push({ id: "ended", kind: "ended", label: "Meeting ended", timestamp: meeting.endedAt.toISOString() });
  }
  timelineEntries.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  const structuredNotes = isStructuredNotes(meeting.notesJson) ? meeting.notesJson : null;
  const pendingApprovals = meeting.decisions.filter((d) => d.status === "PENDING" || d.status === "ESCALATED").length;

  return (
    <main className="relative min-h-svh overflow-hidden bg-background py-10">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[42rem] bg-aurora" />
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-noise" />
      <RealtimeToast organizationId={meeting.organizationId} />

      <Container className="flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          <Link
            href="/board/meetings"
            className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-4" /> Back to meetings
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{meeting.title}</h1>
            <Badge variant={status.variant}>{status.label}</Badge>
          </div>
          <p className="max-w-3xl whitespace-pre-wrap text-sm text-muted-foreground">{meeting.agenda}</p>
        </div>

        <LiveStatsStrip
          startedAt={meeting.startedAt ? meeting.startedAt.toISOString() : null}
          endedAt={meeting.endedAt ? meeting.endedAt.toISOString() : null}
          participants={agentSeats.length + humanSeats.length}
          tasksCreated={tasks.length}
          decisionsMade={decisions.length}
          pendingApprovals={pendingApprovals}
          revenueOpportunity={meeting.relatedLead?.estimatedValue ?? null}
          currency={meeting.organization.currency}
          revenueForecast={revenueForecast.dataSufficient ? revenueForecast.total : null}
        />

        {/* The Table */}
        <div className="glass-panel rounded-3xl p-4 sm:p-6">
          <div className="flex gap-4 overflow-x-auto pb-1">
            {agentSeats.map((agent) => (
              <AgentSeat key={agent.id} agent={agent} />
            ))}
            {humanSeats.map((human) => (
              <HumanSeat key={human.id} human={human} />
            ))}
          </div>
        </div>

        {canManage && (
          <OwnerControls
            meetingId={meeting.id}
            status={meeting.status}
            agents={orgAgents}
            users={orgMemberships.map((m) => m.user)}
            leads={leads}
            relatedLeadId={meeting.relatedLeadId}
          />
        )}

        {structuredNotes && (
          <MeetingNotes
            notes={structuredNotes}
            renderActionItem={(item) => {
              if (typeof item === "string") {
                return (
                  <TrackActionItemRow
                    meetingId={meeting.id}
                    text={item}
                    tracked={trackedTitles.has(deriveTrackedActionItemFields(item).title)}
                    canTrack={canManage}
                  />
                );
              }
              const matched = actionItemByTitle.get(item.title);
              return (
                <StructuredActionItemCard
                  item={item}
                  actionItemId={matched?.id ?? null}
                  taskId={matched?.taskId ?? null}
                  dueDate={matched?.dueDate ? matched.dueDate.toISOString() : null}
                  canManage={canManage}
                />
              );
            }}
          />
        )}

        <Tabs defaultValue="discussion">
          <TabsList className="flex-wrap">
            <TabsTrigger value="discussion">Discussion</TabsTrigger>
            <TabsTrigger value="decisions">Decision Board ({decisions.length})</TabsTrigger>
            <TabsTrigger value="tasks">Task Board ({tasks.length})</TabsTrigger>
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
          </TabsList>

          <TabsContent value="discussion" className="flex flex-col gap-4">
            {canManage && meeting.status === "LIVE" && <ProposeDecisionForm meetingId={meeting.id} />}
            <LiveDiscussion messages={discussionMessages} />
          </TabsContent>

          <TabsContent value="decisions">
            <DecisionBoard decisions={decisions} canOverride={canManage} currency={meeting.organization.currency ?? "USD"} />
          </TabsContent>

          <TabsContent value="tasks">
            <TaskBoard tasks={tasks} canEdit={canManage} />
          </TabsContent>

          <TabsContent value="timeline" className="glass-panel rounded-2xl p-4 sm:p-6">
            <WarRoomTimeline entries={timelineEntries} />
          </TabsContent>
        </Tabs>
      </Container>
    </main>
  );
}
