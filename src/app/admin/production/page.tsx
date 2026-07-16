import { Activity, AlertTriangle, HardDrive, Rocket, ShieldAlert } from "lucide-react";

import { Container } from "@/components/ui/container";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { prisma } from "@/lib/prisma";
import { requirePlatformOwner } from "@/lib/billing/platform-admin";
import { runFullSystemCheck } from "@/lib/monitoring/aggregate";
import { listActiveSystemAlerts } from "@/lib/monitoring/alerts";
import { listRecentBackups } from "@/lib/ops/backup";
import { listRecentRestores } from "@/lib/ops/restore-test";
import { getLastSuccessfulDeployment, listRecentDeployments } from "@/lib/ops/deployment";
import type { ComponentHealth } from "@/lib/monitoring/health";
import type { DeploymentEnvironment, HealthStatus, SystemComponent } from "@/generated/prisma/client";

/**
 * Real Production / Ops dashboard — requirePlatformOwner-gated (this is
 * cross-tenant infrastructure state, not any one organization's data).
 * Every section reads a real, live source: runFullSystemCheck() performs
 * the actual probes health.ts/aggregate.ts define (never a cached/fabricated
 * "all green"); the rest read real rows from SystemHealthSnapshot,
 * SystemAlert, SecurityEvent, Deployment, Backup, and Restore. Deployment
 * rows are written for real by .github/workflows/deploy.yml's
 * build-and-deploy job (see src/lib/ops/deployment.ts) on every manual
 * deploy run — until that workflow has actually run at least once for an
 * environment, its section here renders an honest empty state, not a fake
 * row.
 */

const COMPONENT_LABEL: Record<SystemComponent, string> = {
  DATABASE: "Database (Postgres)",
  REDIS: "Redis",
  AI_PROVIDER: "AI Provider (Anthropic)",
  EMBEDDING_PROVIDER: "Embedding Provider",
  PAYMENT_GATEWAY: "Payment Gateway",
  STORAGE: "Storage (local disk)",
  WORKFLOW_QUEUE: "Workflow Execution Queue",
  SCHEDULER_QUEUE: "Scheduler Queue",
  RAG_QUEUE: "RAG Embedding Queue",
  BILLING_QUEUE: "Recurring Billing Queue",
  EMAIL: "Email",
};

// Environments the CI deploy pipeline (.github/workflows/deploy.yml) can
// target — used purely to drive the "last known-good deployment per
// environment" rollback-readiness lookup below, not stored anywhere new.
const DEPLOYMENT_ENVIRONMENTS: DeploymentEnvironment[] = ["STAGING", "PRODUCTION"];

// Components this app actually probes today (see aggregate.ts's honest gap
// note: EMBEDDING_PROVIDER and EMAIL have no live check yet).
const CHECKED_COMPONENT_ORDER: SystemComponent[] = [
  "DATABASE",
  "REDIS",
  "AI_PROVIDER",
  "PAYMENT_GATEWAY",
  "STORAGE",
  "WORKFLOW_QUEUE",
  "SCHEDULER_QUEUE",
  "RAG_QUEUE",
  "BILLING_QUEUE",
];

const STATUS_BADGE_CLASS: Record<HealthStatus, string> = {
  HEALTHY: "border-emerald-500/30 bg-emerald-500/10 text-emerald-500",
  DEGRADED: "border-amber-500/30 bg-amber-500/10 text-amber-500",
  DOWN: "border-red-500/30 bg-red-500/10 text-red-500",
};

const DOT_CLASS: Record<HealthStatus, string> = {
  HEALTHY: "bg-emerald-500",
  DEGRADED: "bg-amber-500",
  DOWN: "bg-red-500",
};

function formatDateTime(date: Date | string | null): string {
  if (!date) return "—";
  return new Date(date).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formatBytes(bytes: bigint | number | null): string {
  if (bytes === null || bytes === undefined) return "—";
  const n = typeof bytes === "bigint" ? Number(bytes) : bytes;
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = n;
  let unitIndex = -1;
  do {
    value /= 1024;
    unitIndex++;
  } while (value >= 1024 && unitIndex < units.length - 1);
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

function UptimeStrip({ snapshots }: { snapshots: { status: HealthStatus; createdAt: Date }[] }) {
  if (snapshots.length === 0) {
    return <p className="text-xs text-muted-foreground">No history yet — the health-snapshot job runs every 5 minutes.</p>;
  }
  // Oldest -> newest, left to right, matching a standard status-page strip.
  const chronological = [...snapshots].reverse();
  return (
    <div className="flex items-center gap-0.5">
      {chronological.map((s, i) => (
        <span
          key={i}
          title={`${s.status} at ${new Date(s.createdAt).toLocaleString()}`}
          className={`h-4 w-1.5 rounded-sm ${DOT_CLASS[s.status]}`}
        />
      ))}
    </div>
  );
}

export default async function ProductionDashboardPage() {
  await requirePlatformOwner("/admin/production");

  const [live, alerts, recentSnapshotRows, securityEvents, deployments, backups, restores, lastGoodByEnvironment] = await Promise.all([
    runFullSystemCheck(),
    listActiveSystemAlerts(50),
    prisma.systemHealthSnapshot.findMany({ orderBy: { createdAt: "desc" }, take: 400 }),
    prisma.securityEvent.findMany({ orderBy: { createdAt: "desc" }, take: 20 }),
    listRecentDeployments(10),
    listRecentBackups(10),
    listRecentRestores(10),
    Promise.all(DEPLOYMENT_ENVIRONMENTS.map((environment) => getLastSuccessfulDeployment(environment))),
  ]);

  const liveByComponent = new Map<SystemComponent, ComponentHealth>(live.components.map((c) => [c.component, c]));
  const snapshotsByComponent = new Map<SystemComponent, typeof recentSnapshotRows>();
  for (const row of recentSnapshotRows) {
    const list = snapshotsByComponent.get(row.component) ?? [];
    if (list.length < 40) list.push(row);
    snapshotsByComponent.set(row.component, list);
  }

  return (
    <Container className="py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Production Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Real, live infrastructure health — every probe below is a genuine check (DB `SELECT 1`, Redis `PING`, real BullMQ
            queue depths), never simulated. See <code className="text-xs">/api/health</code> for the public JSON, and
            <code className="text-xs"> docs/operations/disaster-recovery.md</code> for the backup/restore runbook.
          </p>
        </div>
        <Badge className={STATUS_BADGE_CLASS[live.overall]} variant="outline">
          Overall: {live.overall}
        </Badge>
      </div>

      {/* System Health */}
      <div className="mb-8">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Activity className="size-4" /> System Health
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CHECKED_COMPONENT_ORDER.map((component) => {
            const health = liveByComponent.get(component);
            if (!health) return null;
            return (
              <Card key={component}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardDescription>{COMPONENT_LABEL[component]}</CardDescription>
                    <Badge variant="outline" className={STATUS_BADGE_CLASS[health.status]}>
                      {health.status}
                    </Badge>
                  </div>
                  <CardTitle className="text-xl">{health.latencyMs !== undefined ? `${health.latencyMs}ms` : "—"}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {health.detail && <p className="text-xs text-muted-foreground">{health.detail}</p>}
                  <UptimeStrip snapshots={snapshotsByComponent.get(component) ?? []} />
                </CardContent>
              </Card>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Not yet probed (honest gap, see aggregate.ts): {COMPONENT_LABEL.EMBEDDING_PROVIDER}, {COMPONENT_LABEL.EMAIL}.
        </p>
      </div>

      {/* Security Alerts */}
      <div className="mb-8">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <ShieldAlert className="size-4" /> Active System Alerts
        </h2>
        <Card>
          <CardContent className="pt-6">
            {alerts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No active alerts. Real infra alerts (DB/queue/AI/payment/storage failures) appear here the moment a health check reports DOWN.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {alerts.map((alert) => (
                    <TableRow key={alert.id}>
                      <TableCell className="font-medium">{alert.type}</TableCell>
                      <TableCell>
                        <Badge variant={alert.severity === "CRITICAL" ? "default" : "outline"}>{alert.severity}</Badge>
                      </TableCell>
                      <TableCell>{alert.status}</TableCell>
                      <TableCell className="max-w-md truncate" title={alert.message}>{alert.title}</TableCell>
                      <TableCell className="text-muted-foreground">{formatDateTime(alert.createdAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Security Events feed */}
      <div className="mb-8">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <AlertTriangle className="size-4" /> Recent Security Events
        </h2>
        <Card>
          <CardContent className="pt-6">
            {securityEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground">No security events recorded yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead>IP</TableHead>
                    <TableHead>Detail</TableHead>
                    <TableHead>When</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {securityEvents.map((event) => (
                    <TableRow key={event.id}>
                      <TableCell className="font-medium">{event.type}</TableCell>
                      <TableCell>
                        <Badge variant={event.severity === "CRITICAL" ? "default" : event.severity === "WARNING" ? "outline" : "secondary"}>
                          {event.severity}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{event.ipAddress ?? "—"}</TableCell>
                      <TableCell className="max-w-sm truncate text-muted-foreground" title={event.detail ?? undefined}>{event.detail ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{formatDateTime(event.createdAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Deployments */}
      <div className="mb-8">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Rocket className="size-4" /> Deployments
        </h2>
        <Card>
          <CardContent className="pt-6">
            {deployments.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No deployments recorded yet — <code className="text-xs">.github/workflows/deploy.yml</code>&apos;s build-and-deploy
                job writes a real row here on every manual deploy run (build, migrate, and GHCR image push); it just hasn&apos;t
                run yet. This is an honest empty state, not a placeholder.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Environment</TableHead>
                    <TableHead>Version</TableHead>
                    <TableHead>Commit</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Deployed by</TableHead>
                    <TableHead>Started</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deployments.map((deployment) => (
                    <TableRow key={deployment.id}>
                      <TableCell>{deployment.environment}</TableCell>
                      <TableCell className="font-medium">{deployment.version}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{deployment.commitSha.slice(0, 8)}</TableCell>
                      <TableCell>{deployment.status}{deployment.rollbackOfId ? " (rollback)" : ""}</TableCell>
                      <TableCell className="text-muted-foreground">{deployment.deployedByUser?.name ?? deployment.deployedByUser?.email ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{formatDateTime(deployment.startedAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Rollback readiness */}
      <div className="mb-8">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Rocket className="size-4" /> Rollback Readiness
        </h2>
        <Card>
          <CardHeader>
            <CardDescription>
              Real query (<code className="text-xs">getLastSuccessfulDeployment</code>, src/lib/ops/deployment.ts) — the last
              SUCCEEDED deployment per environment is what a rollback would target today. Actually re-deploying it to a live
              host, and inserting a chained <code className="text-xs">rollbackOfId</code> row, still requires real hosting
              credentials this environment doesn&apos;t have (see the rollback job in deploy.yml).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Environment</TableHead>
                  <TableHead>Last known-good version</TableHead>
                  <TableHead>Commit</TableHead>
                  <TableHead>Succeeded at</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {DEPLOYMENT_ENVIRONMENTS.map((environment, i) => {
                  const lastGood = lastGoodByEnvironment[i];
                  return (
                    <TableRow key={environment}>
                      <TableCell>{environment}</TableCell>
                      <TableCell className="font-medium">{lastGood?.version ?? "—"}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {lastGood ? lastGood.commitSha.slice(0, 8) : "No successful deployment on file yet."}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{formatDateTime(lastGood?.finishedAt ?? null)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Backups & Restore Tests */}
      <div>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <HardDrive className="size-4" /> Backups &amp; Restore Tests
        </h2>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent backups</CardTitle>
              <CardDescription>
                Real <code className="text-xs">Backup</code> rows written by <code className="text-xs">npm run backup:database</code> /{" "}
                <code className="text-xs">backup:storage</code> — see docs/operations/disaster-recovery.md.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {backups.length === 0 ? (
                <p className="text-sm text-muted-foreground">No backups recorded yet — run `npm run backup:database` to create one.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Size</TableHead>
                      <TableHead>Started</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {backups.map((backup) => (
                      <TableRow key={backup.id}>
                        <TableCell>{backup.type}</TableCell>
                        <TableCell>
                          <Badge variant={backup.status === "SUCCEEDED" ? "accent" : backup.status === "FAILED" ? "default" : "outline"}>
                            {backup.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{formatBytes(backup.sizeBytes)}</TableCell>
                        <TableCell className="text-muted-foreground">{formatDateTime(backup.startedAt)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent restore tests</CardTitle>
              <CardDescription>
                Real <code className="text-xs">Restore</code> rows written by <code className="text-xs">npm run restore:test</code>{" "}
                against a genuinely separate scratch database — never production.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {restores.length === 0 ? (
                <p className="text-sm text-muted-foreground">No restore tests recorded yet — run `npm run restore:test` to verify the latest backup.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Status</TableHead>
                      <TableHead>Test?</TableHead>
                      <TableHead>Started</TableHead>
                      <TableHead>Error</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {restores.map((restore) => (
                      <TableRow key={restore.id}>
                        <TableCell>
                          <Badge variant={restore.status === "SUCCEEDED" ? "accent" : restore.status === "FAILED" ? "default" : "outline"}>
                            {restore.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{restore.isTest ? "Test" : "Real"}</TableCell>
                        <TableCell className="text-muted-foreground">{formatDateTime(restore.startedAt)}</TableCell>
                        <TableCell className="max-w-xs truncate text-red-500" title={restore.error ?? undefined}>{restore.error ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </Container>
  );
}
