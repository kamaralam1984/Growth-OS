import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Container } from "@/components/ui/container";
import { Card, CardContent, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatRelativeTime } from "@/lib/utils";
import type { MeetingStatus } from "@/generated/prisma/client";

import { CreateMeetingForm } from "./_components/create-meeting-form";
import { StatusDot } from "../_components/status-dot";
import { formatDuration } from "../_components/meeting-format";

const STATUS_BADGE: Record<MeetingStatus, { label: string; variant: "default" | "secondary" | "outline" | "accent" }> = {
  SCHEDULED: { label: "Scheduled", variant: "outline" },
  LIVE: { label: "Live", variant: "accent" },
  PAUSED: { label: "Paused", variant: "secondary" },
  COMPLETED: { label: "Completed", variant: "secondary" },
  CANCELLED: { label: "Cancelled", variant: "outline" },
};

export default async function MeetingsPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login?callbackUrl=%2Fboard%2Fmeetings");
  }
  const userId = session.user.id;

  const membership = await prisma.membership.findFirst({
    where: { userId, status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
    include: { organization: true },
  });

  if (!membership) {
    redirect("/onboarding");
  }

  const meetings = await prisma.meeting.findMany({
    where: { organizationId: membership.organizationId },
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { participants: true, messages: true, decisions: true } },
      boardReview: { select: { id: true, finalDecision: true } },
    },
  });

  const canStartMeeting = membership.role === "OWNER" || membership.role === "ADMIN";

  return (
    <main className="min-h-svh bg-background py-12">
      <Container className="flex flex-col gap-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              AI board meetings
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Watch your CEO, Sales, Marketing, Proposal, and Outreach agents discuss and decide, live.
            </p>
          </div>
          {canStartMeeting ? (
            <CreateMeetingForm />
          ) : (
            <Badge variant="outline">Only owners and admins can start a meeting</Badge>
          )}
        </div>

        {meetings.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 py-16 text-center">
              <CardTitle>No meetings yet</CardTitle>
              <CardDescription>
                {canStartMeeting
                  ? "Start your first board meeting to see your AI executives discuss your agenda live."
                  : "An owner or admin hasn't started a board meeting yet."}
              </CardDescription>
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col gap-4">
            {meetings.map((meeting) => {
              const status = STATUS_BADGE[meeting.status];
              const duration = formatDuration(meeting.startedAt, meeting.endedAt);
              const href = meeting.boardReview ? `/board/reviews/${meeting.boardReview.id}` : `/board/meetings/${meeting.id}`;
              return (
                <Link key={meeting.id} href={href} className="group block">
                  <Card className="transition-colors duration-150 group-hover:border-primary/40">
                    <CardContent className="flex flex-col gap-3 py-6">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          {meeting.status === "LIVE" && <StatusDot />}
                          <h2 className="text-lg font-semibold text-foreground">{meeting.title}</h2>
                          {meeting.boardReview && <Badge variant="outline">Proposal Review{meeting.boardReview.finalDecision ? `: ${meeting.boardReview.finalDecision.replace(/_/g, " ")}` : ""}</Badge>}
                        </div>
                        <Badge variant={status.variant}>{status.label}</Badge>
                      </div>
                      <p className="line-clamp-2 text-sm text-muted-foreground">{meeting.agenda}</p>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span>{formatRelativeTime(meeting.createdAt)}</span>
                        <span>{meeting._count.participants} participants</span>
                        <span>{meeting._count.messages} messages</span>
                        {meeting._count.decisions > 0 && <span>{meeting._count.decisions} decisions</span>}
                        {duration && <span>Duration: {duration}</span>}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </Container>
    </main>
  );
}
