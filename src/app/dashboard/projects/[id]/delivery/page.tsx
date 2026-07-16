import Link from "next/link";
import { notFound } from "next/navigation";
import { Play } from "lucide-react";

import { Container } from "@/components/ui/container";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { prisma } from "@/lib/prisma";
import { requireActiveMembership } from "@/app/dashboard/_lib/require-membership";
import { computeProjectHealthScore, ensureTodayProjectHealthSnapshot } from "@/lib/projects/health-score";
import { computeProjectInsights } from "@/lib/projects/insights";
import { DELIVERY_BOARD_AGENT_TYPES } from "@/lib/ai/personas";
import type { MeetingStatus } from "@/generated/prisma/client";

import { AgentSeat, type WarRoomAgentSeat } from "@/app/board/meetings/[id]/_components/agent-seat";
import { HumanSeat, type WarRoomHumanSeat } from "@/app/board/meetings/[id]/_components/human-seat";
import { LiveDiscussion, type WarRoomMessage } from "@/app/board/meetings/[id]/_components/live-discussion";
import { WarRoomTimeline, type TimelineEntry } from "@/app/board/meetings/[id]/_components/war-room-timeline";
import { RealtimeToast } from "@/app/board/meetings/[id]/_components/realtime-toast";
import { MeetingNotes, type StructuredMeetingNotes } from "@/app/board/meetings/[id]/_components/meeting-notes";

import { DeliveryStatsStrip } from "./_components/delivery-stats-strip";
import { DeliveryBoardOwnerControls } from "./_components/delivery-board-owner-controls";
import { ProposeDeliveryDecisionForm } from "./_components/propose-delivery-decision-form";
import { DeliveryDecisionBoard, type DeliveryDecision } from "./_components/delivery-decision-board";
import { HealthScorePanel } from "./_components/health-score-panel";
import { ClientImpactPanel } from "./_components/client-impact-panel";
import { StartMeetingButton } from "./_components/start-meeting-button";
import { SendReportMenu } from "./_components/send-report-menu";

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
  return !!value && typeof value === "object" && "summary" in value && "actionItems" in value && "risks" in value && "recommendations" in value && "nextSteps" in value;
}

export default async function ProjectDeliveryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;
  const { membership, userId } = await requireActiveMembership(`/dashboard/projects/${projectId}/delivery`);
  const canManage = membership.role === "OWNER" || membership.role === "ADMIN";

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true, organizationId: true, client: { select: { contractValue: true } }, dueDate: true },
  });
  if (!project || project.organizationId !== membership.organizationId) notFound();

  await ensureTodayProjectHealthSnapshot(projectId, project.organizationId);
  const [healthScores, insights] = await Promise.all([computeProjectHealthScore(projectId), computeProjectInsights(projectId)]);

  const latestMeeting = await prisma.meeting.findFirst({
    where: { relatedProjectId: projectId },
    orderBy: { createdAt: "desc" },
    include: {
      participants: {
        include: {
          agent: { select: { id: true, type: true, name: true, status: true, currentTask: true, confidenceScore: true } },
          user: { select: { id: true, name: true } },
        },
      },
      messages: { orderBy: { createdAt: "asc" }, include: { senderAgent: { select: { id: true, name: true, type: true } }, senderUser: { select: { id: true, name: true } } } },
      decisions: { orderBy: { createdAt: "desc" }, include: { votes: { include: { agent: { select: { name: true } } } } } },
    },
  });

  const meetingHistory = await prisma.meeting.findMany({
    where: { relatedProjectId: projectId, ...(latestMeeting ? { id: { not: latestMeeting.id } } : {}) },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { id: true, title: true, status: true, startedAt: true, endedAt: true, createdAt: true },
  });

  const clientImpactData = {
    satisfactionAverage: insights.clientSatisfaction?.average ?? null,
    satisfactionCount: insights.clientSatisfaction?.count ?? 0,
    estimatedCompletionDate: insights.completion.estimatedCompletionDate ? insights.completion.estimatedCompletionDate.toISOString() : null,
    dueDate: project.dueDate ? project.dueDate.toISOString() : null,
    contractValue: project.client?.contractValue ?? null,
  };

  return (
    <main className="relative min-h-svh overflow-hidden bg-background py-8">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[42rem] bg-aurora" />
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-noise" />
      {latestMeeting && <RealtimeToast organizationId={project.organizationId} />}

      <Container className="flex flex-col gap-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">{project.name} — Delivery Board</h1>
          <p className="text-sm text-muted-foreground">
            The 5-seat AI Delivery Board for this project — Project Manager, QA Director, DevOps Director, Delivery Director, and CEO Agent, grounded only in this project&apos;s real data.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <HealthScorePanel scores={healthScores} />
          <ClientImpactPanel data={clientImpactData} />
        </div>

        {canManage && <SendReportMenu projectId={projectId} />}

        {!latestMeeting || latestMeeting.status === "COMPLETED" || latestMeeting.status === "CANCELLED" ? (
          <Card glass>
            <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
              <Play className="size-8 text-muted-foreground" strokeWidth={1.5} />
              <p className="text-sm text-muted-foreground">
                {latestMeeting ? "The last Delivery Board standup has ended." : "No Delivery Board standup has run yet."} Start today&apos;s to review real progress, risks, and quality with the full board.
              </p>
              {canManage && <StartMeetingButton projectId={projectId} />}
            </CardContent>
          </Card>
        ) : (
          <DeliveryMeetingRoom meeting={latestMeeting} organizationId={project.organizationId} canManage={canManage} userId={userId} />
        )}

        {meetingHistory.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-foreground">Meeting history</h2>
            <Card>
              <CardContent className="flex flex-col divide-y divide-border p-0">
                {meetingHistory.map((m) => {
                  const status = STATUS_BADGE[m.status];
                  return (
                    <Link key={m.id} href={`/board/meetings/${m.id}`} className="flex items-center justify-between gap-3 p-3 transition-colors hover:bg-accent">
                      <span className="text-sm text-foreground">{m.title}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">{(m.startedAt ?? m.createdAt).toLocaleDateString()}</span>
                        <Badge variant={status.variant}>{status.label}</Badge>
                      </div>
                    </Link>
                  );
                })}
              </CardContent>
            </Card>
          </section>
        )}
      </Container>
    </main>
  );
}

async function DeliveryMeetingRoom({
  meeting,
  organizationId,
  canManage,
  userId,
}: {
  meeting: NonNullable<Awaited<ReturnType<typeof prisma.meeting.findFirst>>> & {
    participants: Array<{
      agent: { id: string; type: string; name: string; status: string; currentTask: string | null; confidenceScore: number | null } | null;
      user: { id: string; name: string | null } | null;
    }>;
    messages: Array<{
      id: string;
      type: string;
      content: string;
      createdAt: Date;
      priority: string;
      confidenceScore: number | null;
      suggestedAction: string | null;
      evidence: string | null;
      senderAgent: { id: string; name: string; type: string } | null;
      senderUser: { id: string; name: string | null } | null;
    }>;
    decisions: Array<{
      id: string;
      topic: string;
      description: string | null;
      category: string;
      status: string;
      createdAt: Date;
      finalizedAt: Date | null;
      votes: Array<{ vote: string; reasoning: string; agent: { name: string } }>;
    }>;
  };
  organizationId: string;
  canManage: boolean;
  userId: string;
}) {
  const agentParticipants = meeting.participants.map((p) => p.agent).filter((a): a is NonNullable<typeof a> => a !== null);
  const userParticipants = meeting.participants.map((p) => p.user).filter((u): u is NonNullable<typeof u> => u !== null);

  const agentIds = agentParticipants.map((a) => a.id);
  const [memoryGroups, participantMemberships, recommendationsCount] = await Promise.all([
    agentIds.length > 0 ? prisma.agentMemory.groupBy({ by: ["agentId"], where: { agentId: { in: agentIds } }, _count: { _all: true }, _max: { updatedAt: true } }) : Promise.resolve([]),
    prisma.membership.findMany({ where: { organizationId, userId: { in: userParticipants.map((u) => u.id) } }, select: { userId: true, role: true } }),
    prisma.recommendation.count({ where: { relatedMeetingId: meeting.id } }),
  ]);
  const memoryByAgent = new Map(memoryGroups.map((g) => [g.agentId, { count: g._count._all, updatedAt: g._max.updatedAt }]));
  const roleByUserId = new Map(participantMemberships.map((m) => [m.userId, m.role]));

  const agentSeats: WarRoomAgentSeat[] = agentParticipants.map((agent) => ({
    id: agent.id,
    type: agent.type as WarRoomAgentSeat["type"],
    name: agent.name,
    status: agent.status as WarRoomAgentSeat["status"],
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
    type: m.type as WarRoomMessage["type"],
    content: m.content,
    createdAt: m.createdAt.toISOString(),
    priority: m.priority as WarRoomMessage["priority"],
    confidenceScore: m.confidenceScore,
    suggestedAction: m.suggestedAction,
    evidence: m.evidence,
    senderAgent: m.senderAgent as WarRoomMessage["senderAgent"],
    senderUser: m.senderUser,
  }));

  const decisions: DeliveryDecision[] = meeting.decisions.map((d) => ({
    id: d.id,
    topic: d.topic,
    description: d.description,
    category: d.category as DeliveryDecision["category"],
    status: d.status as DeliveryDecision["status"],
    votes: d.votes.map((v) => ({ vote: v.vote as DeliveryDecision["votes"][number]["vote"], agentName: v.agent.name, reasoning: v.reasoning })),
  }));

  const timelineEntries: TimelineEntry[] = [];
  if (meeting.startedAt) timelineEntries.push({ id: "started", kind: "started", label: "Standup started", timestamp: meeting.startedAt.toISOString() });
  for (const m of meeting.messages) {
    const name = m.senderAgent?.name ?? m.senderUser?.name ?? "Someone";
    timelineEntries.push({ id: `msg-${m.id}`, kind: "message", label: `${name} ${MESSAGE_TYPE_LABEL[m.type] ?? "spoke"}`, detail: m.content.slice(0, 90), timestamp: m.createdAt.toISOString() });
  }
  for (const d of meeting.decisions) {
    timelineEntries.push({ id: `dec-${d.id}`, kind: "decision_proposed", label: `Decision proposed: ${d.topic}`, timestamp: d.createdAt.toISOString() });
    for (const v of d.votes) {
      timelineEntries.push({ id: `vote-${d.id}-${v.agent.name}`, kind: "vote", label: `${v.agent.name} voted ${v.vote} on "${d.topic}"`, timestamp: d.createdAt.toISOString() });
    }
    if (d.finalizedAt) timelineEntries.push({ id: `dec-final-${d.id}`, kind: "decision_finalized", label: `Decision finalized: ${d.topic} — ${d.status}`, timestamp: d.finalizedAt.toISOString() });
  }
  if (meeting.endedAt) timelineEntries.push({ id: "ended", kind: "ended", label: "Standup ended", timestamp: meeting.endedAt.toISOString() });
  timelineEntries.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  const structuredNotes = isStructuredNotes(meeting.notesJson) ? meeting.notesJson : null;
  const pendingApprovals = meeting.decisions.filter((d) => d.status === "PENDING" || d.status === "ESCALATED").length;
  const status = STATUS_BADGE[meeting.status];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold text-foreground">{meeting.title}</h2>
        <Badge variant={status.variant}>{status.label}</Badge>
      </div>
      <p className="max-w-3xl whitespace-pre-wrap text-sm text-muted-foreground">{meeting.agenda}</p>

      <DeliveryStatsStrip
        startedAt={meeting.startedAt ? meeting.startedAt.toISOString() : null}
        endedAt={meeting.endedAt ? meeting.endedAt.toISOString() : null}
        participants={agentSeats.length + humanSeats.length}
        recommendationsCount={recommendationsCount}
        decisionsMade={decisions.length}
        pendingApprovals={pendingApprovals}
        overallHealthScore={null}
      />

      <div className="glass-panel rounded-3xl p-4 sm:p-6">
        <div className="flex gap-4 overflow-x-auto pb-1">
          {agentSeats
            .slice()
            .sort((a, b) => DELIVERY_BOARD_AGENT_TYPES.indexOf(a.type as never) - DELIVERY_BOARD_AGENT_TYPES.indexOf(b.type as never))
            .map((agent) => (
              <AgentSeat key={agent.id} agent={agent} />
            ))}
          {humanSeats.map((human) => (
            <HumanSeat key={human.id} human={human} />
          ))}
        </div>
      </div>

      {canManage && <DeliveryBoardOwnerControls meetingId={meeting.id} status={meeting.status} />}

      {structuredNotes && <MeetingNotes notes={structuredNotes} />}

      <Tabs defaultValue="discussion">
        <TabsList className="flex-wrap">
          <TabsTrigger value="discussion">Discussion</TabsTrigger>
          <TabsTrigger value="decisions">Decision Board ({decisions.length})</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
        </TabsList>

        <TabsContent value="discussion" className="flex flex-col gap-4">
          {canManage && meeting.status === "LIVE" && <ProposeDeliveryDecisionForm meetingId={meeting.id} />}
          <LiveDiscussion messages={discussionMessages} />
        </TabsContent>

        <TabsContent value="decisions">
          <DeliveryDecisionBoard decisions={decisions} canManage={canManage} />
        </TabsContent>

        <TabsContent value="timeline" className="glass-panel rounded-2xl p-4 sm:p-6">
          <WarRoomTimeline entries={timelineEntries} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
