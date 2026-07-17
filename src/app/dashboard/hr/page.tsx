import Link from "next/link";
import { Briefcase, CalendarClock } from "lucide-react";

import { Container } from "@/components/ui/container";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/prisma";
import { requireActiveMembership } from "../_lib/require-membership";
import { JobOpeningForm } from "./_components/job-opening-form";
import { LeaveRequestPanel } from "./_components/leave-request-panel";

const STAGE_VARIANT: Record<string, "default" | "secondary" | "outline" | "accent"> = {
  OPEN: "default",
  ON_HOLD: "secondary",
  CLOSED: "outline",
};

export default async function HrPage() {
  const { membership } = await requireActiveMembership("/dashboard/hr");
  const organizationId = membership.organizationId;

  const [jobOpenings, leaveRequests] = await Promise.all([
    prisma.jobOpening.findMany({ where: { organizationId }, include: { _count: { select: { candidates: true } } }, orderBy: { createdAt: "desc" } }),
    prisma.leaveRequest.findMany({ where: { organizationId }, include: { user: { select: { name: true, email: true } } }, orderBy: { createdAt: "desc" }, take: 30 }),
  ]);

  const canDecide = membership.role === "OWNER" || membership.role === "ADMIN";

  return (
    <main className="py-8">
      <Container className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">HR</h1>
          <p className="text-sm text-muted-foreground">Real hiring pipeline and leave management — installable via the HR / Recruitment Agent packs in the Marketplace.</p>
        </div>

        <Card glass>
          <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <Briefcase className="size-4" /> Job openings
            </CardTitle>
            <JobOpeningForm />
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {jobOpenings.length === 0 ? (
              <p className="text-sm text-muted-foreground">No job openings yet.</p>
            ) : (
              jobOpenings.map((job) => (
                <Link key={job.id} href={`/dashboard/hr/jobs/${job.id}`} className="flex items-center justify-between rounded-lg border border-border p-3 text-sm transition-colors hover:border-primary/40">
                  <div>
                    <p className="font-medium text-foreground">{job.title}</p>
                    <p className="text-xs text-muted-foreground">{job.department ?? "No department"} · {job._count.candidates} candidate(s)</p>
                  </div>
                  <Badge variant={STAGE_VARIANT[job.status]}>{job.status}</Badge>
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        <Card glass>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarClock className="size-4" /> Leave requests
            </CardTitle>
          </CardHeader>
          <CardContent>
            <LeaveRequestPanel
              canDecide={canDecide}
              requests={leaveRequests.map((r) => ({
                id: r.id,
                type: r.type,
                startDate: r.startDate.toISOString().slice(0, 10),
                endDate: r.endDate.toISOString().slice(0, 10),
                status: r.status,
                reason: r.reason,
                requesterLabel: r.user.name ?? r.user.email ?? "Unknown",
              }))}
            />
          </CardContent>
        </Card>
      </Container>
    </main>
  );
}
