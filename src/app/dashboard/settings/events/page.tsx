import { Container } from "@/components/ui/container";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { requireActiveMembership } from "../../_lib/require-membership";
import { listRecentEvents } from "@/lib/realtime/event-log";
import { EventLogList, type EventLogRow } from "./_components/event-log-list";

const EVENT_TYPES = ["notification", "activity", "agent_status", "comment", "company_discovery_progress"];
const PRIVILEGED_ROLES = new Set(["OWNER", "ADMIN"]);

export default async function EventsPage() {
  const { membership } = await requireActiveMembership("/dashboard/settings/events");

  const events = await listRecentEvents(membership.organizationId, { limit: 200 });
  const rows: EventLogRow[] = events.map((event) => ({
    id: event.id,
    eventType: event.eventType,
    payload: event.payload,
    publishedAt: event.publishedAt.toISOString(),
    replayedAt: event.replayedAt ? event.replayedAt.toISOString() : null,
    replayCount: event.replayCount,
  }));

  return (
    <Container className="py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Event History</h1>
        <p className="text-sm text-muted-foreground">
          Durable log of every realtime event this organization has published — notifications, activity, agent status
          changes, portal comments — mirrored from the in-memory event bus into EventLog so history survives past
          whatever&apos;s currently connected over SSE. Owners and admins can replay any event.
        </p>
      </div>

      <Card glass>
        <CardHeader>
          <CardTitle>Recent events</CardTitle>
          <CardDescription>Most recent 200 events for this organization, newest first.</CardDescription>
        </CardHeader>
        <CardContent>
          <EventLogList events={rows} eventTypes={EVENT_TYPES} canReplay={PRIVILEGED_ROLES.has(membership.role)} />
        </CardContent>
      </Card>
    </Container>
  );
}
