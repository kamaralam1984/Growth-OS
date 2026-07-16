import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, FileText } from "lucide-react";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Container } from "@/components/ui/container";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import type { MeetingStatus, DocumentKind } from "@/generated/prisma/client";

import { AgentSeat, type WarRoomAgentSeat } from "@/app/board/meetings/[id]/_components/agent-seat";
import { HumanSeat, type WarRoomHumanSeat } from "@/app/board/meetings/[id]/_components/human-seat";
import { LiveDiscussion, type WarRoomMessage } from "@/app/board/meetings/[id]/_components/live-discussion";
import { WarRoomTimeline, type TimelineEntry } from "@/app/board/meetings/[id]/_components/war-room-timeline";
import { RealtimeToast } from "@/app/board/meetings/[id]/_components/realtime-toast";

import { ReviewDiscussion, type ReviewFinding } from "./_components/review-finding-card";
import { ReviewVotingBar, type ReviewVoteTally } from "./_components/review-voting-bar";
import { ReviewDecisionBanner } from "./_components/review-decision-banner";
import { FinanceReviewPanel } from "./_components/finance-review-panel";
import { LegalReviewPanel } from "./_components/legal-review-panel";
import { ReviewOwnerControls } from "./_components/review-owner-controls";

const STATUS_BADGE: Record<MeetingStatus, { label: string; variant: "default" | "secondary" | "outline" | "accent" }> = {
  SCHEDULED: { label: "Scheduled", variant: "outline" },
  LIVE: { label: "Live", variant: "accent" },
  PAUSED: { label: "Paused", variant: "secondary" },
  COMPLETED: { label: "Completed", variant: "secondary" },
  CANCELLED: { label: "Cancelled", variant: "outline" },
};

const DOC_LINK: Record<DocumentKind, (id: string) => string> = {
  PROPOSAL: (id) => `/dashboard/proposal/proposals/${id}`,
  QUOTATION: (id) => `/dashboard/proposal/quotations/${id}`,
  CONTRACT: (id) => `/dashboard/proposal/contracts/${id}`,
  INVOICE: (id) => `/dashboard/proposal/invoices/${id}`,
  BUSINESS_DOCUMENT: (id) => `/dashboard/proposal/documents/${id}`,
};

const DOC_KIND_LABEL: Record<DocumentKind, string> = {
  PROPOSAL: "Proposal",
  QUOTATION: "Quotation",
  CONTRACT: "Contract",
  INVOICE: "Invoice",
  BUSINESS_DOCUMENT: "Document",
};

interface ReviewJsonShape {
  opinion: string;
  strengths: string[];
  weaknesses: string[];
  recommendations: Array<{ type: string; title: string; description: string }>;
  winProbability?: number;
  profitMarginEstimate?: number;
}

function isReviewJson(value: unknown): value is ReviewJsonShape {
  return !!value && typeof value === "object" && "opinion" in value && "strengths" in value && "weaknesses" in value;
}

export default async function ReviewRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/login?callbackUrl=%2Fboard%2Freviews%2F${id}`);
  }
  const userId = session.user.id;

  const boardReview = await prisma.boardReview.findUnique({
    where: { id },
    include: {
      riskAnalysis: true,
      profitAnalysis: true,
      organization: { select: { currency: true } },
      meeting: {
        include: {
          participants: {
            include: {
              agent: { select: { id: true, type: true, name: true, status: true, currentTask: true, confidenceScore: true } },
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
          decisions: { orderBy: { createdAt: "desc" }, include: { votes: { include: { agent: { select: { name: true } } } } } },
        },
      },
    },
  });

  if (!boardReview) notFound();
  const { meeting } = boardReview;

  const membership = await prisma.membership.findUnique({
    where: { userId_organizationId: { userId, organizationId: boardReview.organizationId } },
  });
  if (!membership || membership.status !== "ACTIVE") {
    redirect("/board/reviews");
  }
  const canManage = membership.role === "OWNER" || membership.role === "ADMIN";
  const status = STATUS_BADGE[meeting.status];

  const agentParticipants = meeting.participants.map((p) => p.agent).filter((agent): agent is NonNullable<typeof agent> => agent !== null);
  const userParticipants = meeting.participants.map((p) => p.user).filter((user): user is NonNullable<typeof user> => user !== null);

  const agentIds = agentParticipants.map((a) => a.id);
  const [memoryGroups, participantMemberships] = await Promise.all([
    agentIds.length > 0
      ? prisma.agentMemory.groupBy({ by: ["agentId"], where: { agentId: { in: agentIds } }, _count: { _all: true }, _max: { updatedAt: true } })
      : Promise.resolve([]),
    prisma.membership.findMany({
      where: { organizationId: boardReview.organizationId, userId: { in: userParticipants.map((u) => u.id) } },
      select: { userId: true, role: true },
    }),
  ]);
  const memoryByAgent = new Map(memoryGroups.map((g) => [g.agentId, { count: g._count._all, updatedAt: g._max.updatedAt }]));
  const roleByUserId = new Map(participantMemberships.map((m) => [m.userId, m.role]));

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

  const findings: ReviewFinding[] = meeting.messages
    .filter((m) => isReviewJson(m.reviewJson))
    .map((m) => {
      const parsed = m.reviewJson as unknown as ReviewJsonShape;
      return {
        id: m.id,
        createdAt: m.createdAt.toISOString(),
        confidenceScore: m.confidenceScore,
        senderAgent: m.senderAgent,
        opinion: parsed.opinion,
        strengths: parsed.strengths,
        weaknesses: parsed.weaknesses,
        recommendations: parsed.recommendations ?? [],
        winProbability: parsed.winProbability ?? null,
        profitMarginEstimate: parsed.profitMarginEstimate ?? null,
      };
    });

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

  const decision = meeting.decisions.find((d) => d.id === boardReview.decisionId) ?? meeting.decisions[0] ?? null;
  const voteTallies: ReviewVoteTally[] = decision ? decision.votes.map((v) => ({ vote: v.vote, agentName: v.agent.name, reasoning: v.reasoning })) : [];

  const timelineEntries: TimelineEntry[] = [];
  if (meeting.startedAt) timelineEntries.push({ id: "started", kind: "started", label: "Review started", timestamp: meeting.startedAt.toISOString() });
  for (const m of meeting.messages) {
    const name = m.senderAgent?.name ?? m.senderUser?.name ?? "Someone";
    timelineEntries.push({ id: `msg-${m.id}`, kind: "message", label: `${name} contributed`, detail: m.content.slice(0, 90), timestamp: m.createdAt.toISOString() });
  }
  if (decision) {
    for (const v of decision.votes) {
      timelineEntries.push({ id: `vote-${decision.id}-${v.agent.name}`, kind: "vote", label: `${v.agent.name} voted ${v.vote}`, timestamp: decision.createdAt.toISOString() });
    }
    if (decision.finalizedAt) {
      timelineEntries.push({ id: `dec-final-${decision.id}`, kind: "decision_finalized", label: `Board decision finalized: ${boardReview.finalDecision ?? decision.status}`, timestamp: decision.finalizedAt.toISOString() });
    }
  }
  if (meeting.endedAt) timelineEntries.push({ id: "ended", kind: "ended", label: "Review ended", timestamp: meeting.endedAt.toISOString() });
  timelineEntries.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  return (
    <main className="relative min-h-svh overflow-hidden bg-background py-10">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[42rem] bg-aurora" />
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-noise" />
      <RealtimeToast organizationId={boardReview.organizationId} />

      <Container className="flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          <Link href="/board/reviews" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
            <ArrowLeft className="size-4" /> Back to reviews
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{meeting.title}</h1>
            <Badge variant={status.variant}>{status.label}</Badge>
            <Link href={DOC_LINK[boardReview.docKind](boardReview.docId)} className="flex items-center gap-1 text-xs text-primary hover:underline">
              <FileText className="size-3.5" /> View {DOC_KIND_LABEL[boardReview.docKind]}
            </Link>
          </div>
          <p className="max-w-3xl whitespace-pre-wrap text-sm text-muted-foreground">{meeting.agenda}</p>
        </div>

        {boardReview.finalDecision && (
          <ReviewDecisionBanner decision={boardReview.finalDecision} overallConfidence={boardReview.overallConfidence} winProbability={boardReview.winProbability} />
        )}

        {/* The Table */}
        <div className="glass-panel rounded-3xl p-4 sm:p-6">
          <div className="flex gap-4 overflow-x-auto pb-1">
            {agentSeats.map((agent) => (
              <AgentSeat key={agent.id} agent={agent} showVoiceWave />
            ))}
            {humanSeats.map((human) => (
              <HumanSeat key={human.id} human={human} />
            ))}
          </div>
        </div>

        {canManage && (
          <ReviewOwnerControls boardReviewId={boardReview.id} meetingId={meeting.id} status={meeting.status} hasFinalDecision={boardReview.finalDecision != null} />
        )}

        <Tabs defaultValue="findings">
          <TabsList className="flex-wrap">
            <TabsTrigger value="findings">Findings ({findings.length})</TabsTrigger>
            <TabsTrigger value="discussion">Discussion</TabsTrigger>
            <TabsTrigger value="votes">Votes &amp; Decision</TabsTrigger>
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
          </TabsList>

          <TabsContent value="findings">
            <ReviewDiscussion findings={findings} />
          </TabsContent>

          <TabsContent value="discussion">
            <LiveDiscussion messages={discussionMessages} />
          </TabsContent>

          <TabsContent value="votes" className="flex flex-col gap-4">
            {(boardReview.profitAnalysis || boardReview.riskAnalysis) && (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {boardReview.profitAnalysis && <FinanceReviewPanel data={boardReview.profitAnalysis} currency={boardReview.organization.currency} />}
                {boardReview.riskAnalysis && <LegalReviewPanel data={boardReview.riskAnalysis} />}
              </div>
            )}
            <div className="glass-panel rounded-2xl p-4 sm:p-6">
              {decision ? (
                <ReviewVotingBar votes={voteTallies} />
              ) : (
                <p className="py-6 text-center text-sm text-muted-foreground">No vote has been run yet — click &ldquo;Run final vote&rdquo; once the discussion is ready.</p>
              )}
            </div>
          </TabsContent>

          <TabsContent value="timeline" className="glass-panel rounded-2xl p-4 sm:p-6">
            <WarRoomTimeline entries={timelineEntries} />
          </TabsContent>
        </Tabs>
      </Container>
    </main>
  );
}
