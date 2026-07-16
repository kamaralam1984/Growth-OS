import type { ComponentType } from "react";
import Link from "next/link";
import { MessageSquare, ListChecks, CheckCircle2, Bell, Zap, Users as UsersIcon } from "lucide-react";

import { prisma } from "@/lib/prisma";
import { Container } from "@/components/ui/container";
import { Card, CardContent, CardTitle, CardDescription } from "@/components/ui/card";
import { cn, formatRelativeTime } from "@/lib/utils";
import { requireActiveMembership } from "../../_lib/require-membership";
import type { ActivityType } from "@/generated/prisma/client";

const ACTIVITY_ICONS: Record<ActivityType, ComponentType<{ className?: string }>> = {
  MEETING: UsersIcon,
  AGENT_MESSAGE: MessageSquare,
  TASK_UPDATE: ListChecks,
  COMPLETED_WORK: CheckCircle2,
  NOTIFICATION: Bell,
  SYSTEM_EVENT: Zap,
};

const FILTERS: Array<{ value: ActivityType | "ALL"; label: string }> = [
  { value: "ALL", label: "All" },
  { value: "SYSTEM_EVENT", label: "CRM Updates" },
  { value: "TASK_UPDATE", label: "Task Updates" },
  { value: "MEETING", label: "Meetings" },
  { value: "AGENT_MESSAGE", label: "AI Decisions" },
  { value: "NOTIFICATION", label: "Notifications" },
  { value: "COMPLETED_WORK", label: "Completed Work" },
];

function isActivityType(value: string | undefined): value is ActivityType {
  return Boolean(value) && Object.prototype.hasOwnProperty.call(ACTIVITY_ICONS, value as ActivityType);
}

/**
 * The CRM's own Activity Feed — same Activity model and formatting as
 * /board/activity, just scoped under the CRM sub-nav and org-wide rather
 * than agent-centric (Lead Created, Company Added, Task Completed,
 * Proposal Generated, Deal Won/Lost, etc. all land here via logActivity()
 * calls made throughout the CRM actions — no separate feed to maintain).
 */
export default async function CrmActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const { membership } = await requireActiveMembership("/dashboard/crm/activity");
  const organizationId = membership.organizationId;

  const { type } = await searchParams;
  const activeFilter = isActivityType(type) ? type : "ALL";

  const activities = await prisma.activity.findMany({
    where: { organizationId, ...(activeFilter !== "ALL" ? { type: activeFilter } : {}) },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { actorAgent: { select: { name: true } }, actorUser: { select: { name: true } } },
  });

  return (
    <main className="py-8">
      <Container className="flex flex-col gap-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Activity Feed</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            The organization&rsquo;s unified CRM timeline — leads, deals, tasks, proposals, meetings, and AI decisions.
          </p>
        </div>

        <nav className="flex flex-wrap gap-1.5">
          {FILTERS.map((filter) => (
            <Link
              key={filter.value}
              href={filter.value === "ALL" ? "/dashboard/crm/activity" : `/dashboard/crm/activity?type=${filter.value}`}
              className={cn(
                "inline-flex items-center rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                activeFilter === filter.value
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {filter.label}
            </Link>
          ))}
        </nav>

        <Card>
          <CardContent className="flex flex-col divide-y divide-border p-0">
            {activities.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-16 text-center">
                <CardTitle>Nothing here yet</CardTitle>
                <CardDescription>Activity will show up here as your team works the pipeline.</CardDescription>
              </div>
            ) : (
              activities.map((activity) => {
                const Icon = ACTIVITY_ICONS[activity.type];
                const actorName = activity.actorAgent?.name ?? activity.actorUser?.name ?? null;
                return (
                  <div key={activity.id} className="flex items-start gap-3 p-4">
                    <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-foreground">
                        {actorName && <span className="font-medium">{actorName}: </span>}
                        {activity.description}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{formatRelativeTime(activity.createdAt)}</p>
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </Container>
    </main>
  );
}
