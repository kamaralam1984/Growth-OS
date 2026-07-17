import { Container } from "@/components/ui/container";
import { prisma } from "@/lib/prisma";
import { requireActiveMembership } from "@/app/dashboard/_lib/require-membership";
import { PollRefresher } from "@/components/command-center/poll-refresher";
import { AlertList, type AlertRow } from "./_components/alert-list";

const SEVERITY_ORDER: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
const STATUS_ORDER: Record<string, number> = { ACTIVE: 0, ACKNOWLEDGED: 1, RESOLVED: 2 };

export default async function AlertsPage() {
  const { membership } = await requireActiveMembership("/dashboard/alerts");

  const alerts = await prisma.alert.findMany({ where: { organizationId: membership.organizationId } });

  const sorted = [...alerts].sort((a, b) => {
    const statusDiff = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    if (statusDiff !== 0) return statusDiff;
    const severityDiff = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (severityDiff !== 0) return severityDiff;
    return b.triggeredAt.getTime() - a.triggeredAt.getTime();
  });

  const rows: AlertRow[] = sorted.map((a) => ({
    id: a.id,
    type: a.type,
    severity: a.severity,
    status: a.status,
    title: a.title,
    message: a.message,
    relatedEntityType: a.relatedEntityType,
    metricValue: a.metricValue,
    thresholdValue: a.thresholdValue,
    formula: a.formula,
    mitigationSuggestions: a.mitigationSuggestions,
    triggeredAt: a.triggeredAt.toISOString(),
    acknowledgedAt: a.acknowledgedAt ? a.acknowledgedAt.toISOString() : null,
    resolvedAt: a.resolvedAt ? a.resolvedAt.toISOString() : null,
  }));

  const activeCount = alerts.filter((a) => a.status === "ACTIVE").length;

  return (
    <main className="py-8">
      <PollRefresher />
      <Container className="flex flex-col gap-8">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Smart Alerts</h1>
          <p className="text-sm text-muted-foreground">
            {activeCount} active alert{activeCount === 1 ? "" : "s"} — every trigger below traces to a real rule evaluated against real
            business data, never an LLM guess.
          </p>
        </div>

        <AlertList alerts={rows} />
      </Container>
    </main>
  );
}
