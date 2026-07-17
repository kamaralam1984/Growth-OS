import Link from "next/link";
import type { Metadata } from "next";
import { AlertTriangle, CheckCircle2, CircleAlert, XCircle } from "lucide-react";

import { Container } from "@/components/ui/container";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Logo } from "@/components/brand/logo";
import { prisma } from "@/lib/prisma";
import { runFullSystemCheck } from "@/lib/monitoring/aggregate";
import { computeUptimeWindows, hasAnyHealthHistory } from "./_lib/uptime";
import type { HealthStatus, SystemComponent } from "@/generated/prisma/client";

/**
 * Real, PUBLIC status page — no auth, reachable by anyone (a real uptime
 * monitor, a prospective customer, a user wondering if it's them or us).
 *
 * Every number on this page is genuine:
 *  - "Current status" is a LIVE probe: `runFullSystemCheck()` (the same
 *    function src/app/admin/production/page.tsx calls) makes real calls —
 *    a real DB `SELECT 1`, a real Redis `PING`, real BullMQ queue depth
 *    reads — on every request. It is intentionally the NON-persisting
 *    variant (not `runAndRecordFullSystemCheck`, which is what
 *    `/api/health` calls): that function also WRITES a SystemHealthSnapshot
 *    row and reconciles SystemAlert rows as a side effect, which would mean
 *    every anonymous page view mutates monitoring history — appropriate for
 *    a real uptime-monitor hitting `/api/health` on a schedule, not for
 *    public foot traffic hitting this page. History still accrues from
 *    `/api/health` and the periodic health-snapshot job either way.
 *  - "Uptime" percentages are computed from real `SystemHealthSnapshot`
 *    rows (see ./_lib/uptime.ts) — never a fabricated "99.99%." When no
 *    snapshot history exists yet, this page says so honestly instead of
 *    showing a fake number.
 *  - "Incidents" are real `Incident` rows, filtered to customer-facing
 *    categories (OPERATIONAL/AVAILABILITY) and to public-safe fields only
 *    (title/status/started-at) — `description`/`postmortem` and
 *    SECURITY/DATA/COMPLIANCE-categorized incidents are deliberately never
 *    surfaced here, since those are exactly the fields/categories that can
 *    carry internal detail, PII, or security posture (see the Incident
 *    model in prisma/schema.prisma and src/lib/security/incidents.ts's
 *    `ensureIncidentForCriticalEvent`, which derives incident titles
 *    straight from real security-event types).
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "System Status — KVL GrowthOS",
  description: "Live status and uptime history for KVL GrowthOS.",
};

const COMPONENT_LABEL: Record<SystemComponent, string> = {
  DATABASE: "Database",
  REDIS: "Cache (Redis)",
  AI_PROVIDER: "AI Provider",
  EMBEDDING_PROVIDER: "Embedding Provider",
  PAYMENT_GATEWAY: "Payment Processing",
  STORAGE: "File Storage",
  WORKFLOW_QUEUE: "Workflow Automation",
  SCHEDULER_QUEUE: "Scheduler",
  RAG_QUEUE: "AI Knowledge Indexing",
  BILLING_QUEUE: "Billing Processing",
  EMAIL: "Email",
};

const STATUS_BADGE_CLASS: Record<HealthStatus, string> = {
  HEALTHY: "border-emerald-500/30 bg-emerald-500/10 text-emerald-500",
  DEGRADED: "border-amber-500/30 bg-amber-500/10 text-amber-500",
  DOWN: "border-red-500/30 bg-red-500/10 text-red-500",
};

const STATUS_LABEL: Record<HealthStatus, string> = {
  HEALTHY: "Operational",
  DEGRADED: "Degraded",
  DOWN: "Outage",
};

const STATUS_ICON: Record<HealthStatus, typeof CheckCircle2> = {
  HEALTHY: CheckCircle2,
  DEGRADED: CircleAlert,
  DOWN: XCircle,
};

function formatDateTime(date: Date | string): string {
  return new Date(date).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatPercent(percent: number): string {
  // 3 decimals is enough resolution to show a real, non-fabricated
  // difference below 100% without implying false precision.
  return `${percent.toFixed(percent === 100 ? 0 : 3)}%`;
}

export default async function StatusPage() {
  const [live, uptimeWindows, hasHistory, openIncidents] = await Promise.all([
    runFullSystemCheck(),
    computeUptimeWindows(),
    hasAnyHealthHistory(),
    prisma.incident.findMany({
      where: {
        status: { not: "RESOLVED" },
        // Customer-facing categories only — SECURITY/DATA/COMPLIANCE
        // incidents are never surfaced on the public page (see file-level
        // comment above).
        category: { in: ["OPERATIONAL", "AVAILABILITY"] },
      },
      select: { id: true, title: true, status: true, startedAt: true },
      orderBy: { startedAt: "desc" },
      take: 25,
    }),
  ]);

  const OverallIcon = STATUS_ICON[live.overall];

  return (
    <main className="min-h-svh bg-background pb-16">
      <header className="border-b border-border">
        <Container className="flex items-center justify-between py-6">
          <Link href="/" aria-label="KVL GrowthOS home">
            <Logo />
          </Link>
          <Link href="/login" className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground">
            Sign in
          </Link>
        </Container>
      </header>

      <Container className="flex flex-col gap-10 pt-10">
        {/* Overall status */}
        <div className="flex flex-col items-start gap-3">
          <Badge variant="outline" className={`gap-2 px-3 py-1.5 text-sm ${STATUS_BADGE_CLASS[live.overall]}`}>
            <OverallIcon className="size-4" />
            {live.overall === "HEALTHY"
              ? "All systems operational"
              : live.overall === "DEGRADED"
                ? "Some systems degraded"
                : "Active outage"}
          </Badge>
          <h1 className="text-2xl font-semibold text-foreground">System Status</h1>
          <p className="text-sm text-muted-foreground">
            Live checked at {formatDateTime(live.checkedAt)}. This page runs the same real health probes as our internal
            monitoring — never a cached or simulated result.
          </p>
        </div>

        {/* Uptime windows */}
        <div>
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">Uptime</h2>
          {!hasHistory ? (
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">
                  No historical uptime data has been recorded yet. Uptime percentages will appear here once health checks
                  have run over time — we don&apos;t show a made-up number in the meantime.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {uptimeWindows.map((window) => (
                <Card key={window.label}>
                  <CardHeader className="pb-2">
                    <CardDescription>{window.label}</CardDescription>
                    <CardTitle className="text-2xl">
                      {window.percent === null ? "No data yet" : formatPercent(window.percent)}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs text-muted-foreground">
                      {window.totalChecks === 0
                        ? "No checks recorded in this window yet."
                        : `${window.totalChecks - window.downChecks} of ${window.totalChecks} recorded checks were up.`}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Current component status (live) */}
        <div>
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">Current status</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {live.components.map((component) => (
              <Card key={component.component}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardDescription>{COMPONENT_LABEL[component.component]}</CardDescription>
                    <Badge variant="outline" className={STATUS_BADGE_CLASS[component.status]}>
                      {STATUS_LABEL[component.status]}
                    </Badge>
                  </div>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>

        {/* Open incidents */}
        <div>
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">Incidents</h2>
          {openIncidents.length === 0 ? (
            <Card>
              <CardContent className="flex items-center gap-2 pt-6 text-sm text-muted-foreground">
                <CheckCircle2 className="size-4 text-emerald-500" />
                No open incidents.
              </CardContent>
            </Card>
          ) : (
            <div className="flex flex-col gap-3">
              {openIncidents.map((incident) => (
                <Card key={incident.id}>
                  <CardContent className="flex flex-col gap-1 pt-6 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="size-4 text-amber-500" />
                      <span className="font-medium text-foreground">{incident.title}</span>
                      <Badge variant="outline">{incident.status}</Badge>
                    </div>
                    <span className="text-xs text-muted-foreground">Started {formatDateTime(incident.startedAt)}</span>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </Container>
    </main>
  );
}
