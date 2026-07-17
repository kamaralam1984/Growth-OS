import Link from "next/link";
import { Rocket, ShieldCheck, FileCheck2, Gauge, Accessibility, Server, Globe2 } from "lucide-react";

import { Container } from "@/components/ui/container";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { requirePlatformOwner } from "@/lib/billing/platform-admin";
import { getLatestLaunchChecklistRun, type LaunchCheck } from "@/lib/ops/launch-checklist";
import { getLaunchDashboardScores } from "@/lib/ops/launch-dashboard";
import { RunChecklistButton } from "./_components/run-checklist-button";

function formatDateTime(date: Date): string {
  return date.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function scoreColor(score: number | null): string {
  if (score === null) return "text-muted-foreground";
  if (score >= 85) return "text-emerald-500";
  if (score >= 60) return "text-amber-500";
  return "text-destructive";
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "accent"> = {
  PASS: "accent",
  WARN: "outline",
  FAIL: "default",
};

interface ScoreCardDef {
  key: keyof Awaited<ReturnType<typeof getLaunchDashboardScores>>;
  label: string;
  icon: typeof Rocket;
  href?: string;
}

const SCORE_CARDS: ScoreCardDef[] = [
  { key: "globalReadinessScore", label: "Global Readiness", icon: Globe2 },
  { key: "launchScore", label: "Launch Score", icon: Rocket },
  { key: "securityScore", label: "Security Score", icon: ShieldCheck, href: "/admin/compliance/risks" },
  { key: "complianceScore", label: "Compliance Score", icon: FileCheck2, href: "/admin/compliance" },
  { key: "performanceScore", label: "Performance Score", icon: Gauge, href: "/admin/performance" },
  { key: "accessibilityScore", label: "Accessibility Score", icon: Accessibility },
  { key: "infrastructureHealthScore", label: "Infrastructure Health", icon: Server, href: "/admin/production" },
];

/**
 * Owner Launch Dashboard — every score is computed from real, already-
 * persisted data (see src/lib/ops/launch-dashboard.ts's top comment); a
 * component with no data yet honestly renders "not measured", never a
 * fabricated number. This is the single top-level view Phase 20 exists to
 * produce: is this deployment actually ready, backed by evidence a click
 * away on every card.
 */
export default async function AdminLaunchPage() {
  await requirePlatformOwner("/admin/launch");

  const [scores, latestRun] = await Promise.all([getLaunchDashboardScores(), getLatestLaunchChecklistRun()]);
  const checks = (latestRun?.checks as unknown as LaunchCheck[] | null) ?? [];

  const grouped = new Map<string, LaunchCheck[]>();
  for (const check of checks) {
    const list = grouped.get(check.category) ?? [];
    list.push(check);
    grouped.set(check.category, list);
  }

  return (
    <Container className="flex flex-col gap-6 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Global Launch Readiness</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Every score below traces to real, persisted evidence — a component with no data yet honestly shows{" "}
            <span className="italic">not measured</span>, never a fabricated number.
          </p>
        </div>
        <RunChecklistButton />
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-7">
        {SCORE_CARDS.map(({ key, label, icon: Icon, href }) => {
          const score = scores[key];
          const card = (
            <Card glass className={href ? "transition-colors hover:border-primary/40" : undefined}>
              <CardContent className="p-4">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Icon className="size-3.5" /> {label}
                </div>
                <p className={`mt-1 text-2xl font-semibold ${scoreColor(score)}`}>{score !== null ? score : "—"}</p>
              </CardContent>
            </Card>
          );
          return href ? (
            <Link key={key} href={href}>
              {card}
            </Link>
          ) : (
            <div key={key}>{card}</div>
          );
        })}
      </div>

      <Card glass>
        <CardHeader>
          <CardTitle>Launch checklist</CardTitle>
          <CardDescription>
            {latestRun
              ? `Last run ${formatDateTime(latestRun.runAt)} — ${latestRun.passCount} pass, ${latestRun.warnCount} warn, ${latestRun.failCount} fail.`
              : "Never run yet — click “Run checklist” for a real, live snapshot."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {checks.length === 0 ? (
            <p className="text-sm text-muted-foreground">No checklist run recorded yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead>Check</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Detail</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...grouped.entries()].flatMap(([category, categoryChecks]) =>
                  categoryChecks.map((check, i) => (
                    <TableRow key={check.key}>
                      <TableCell className="text-muted-foreground">{i === 0 ? category : ""}</TableCell>
                      <TableCell className="font-medium">{check.label}</TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANT[check.status] ?? "outline"}>{check.status}</Badge>
                      </TableCell>
                      <TableCell className="max-w-md text-xs text-muted-foreground">{check.detail}</TableCell>
                    </TableRow>
                  )),
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </Container>
  );
}
