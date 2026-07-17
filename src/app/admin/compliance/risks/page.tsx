import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Container } from "@/components/ui/container";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { requirePlatformOwner } from "@/lib/billing/platform-admin";
import { listSecurityRisks, getRiskRegisterSummary } from "@/lib/security/risk-register";
import { CreateRiskForm } from "./_components/create-risk-form";
import { RiskStatusControl } from "./_components/risk-status-control";

const BAND_VARIANT: Record<string, "default" | "secondary" | "outline" | "accent"> = {
  LOW: "secondary",
  MEDIUM: "outline",
  HIGH: "accent",
  CRITICAL: "default",
};

function formatDateTime(date: Date | null): string {
  if (!date) return "—";
  return new Date(date).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/**
 * SOC2/ISO27001 security risk register — platform-wide (the platform's own
 * vendor security posture). Real, admin-authored rows; riskScore/band are
 * always deterministic (likelihood * impact, see risk-register.ts), never
 * AI-guessed.
 */
export default async function AdminRiskRegisterPage() {
  await requirePlatformOwner("/admin/compliance/risks");

  const [risks, summary] = await Promise.all([listSecurityRisks(), getRiskRegisterSummary()]);

  return (
    <Container className="flex flex-col gap-6 py-8">
      <div>
        <Link href="/admin/compliance" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="size-4" /> Back to Compliance Readiness
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-foreground">Security Risk Register</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          A real, admin-maintained register of the platform&apos;s own security risks (SOC2 CC3.2 / ISO 27001 Clause
          6.1.2). riskScore is always deterministic (likelihood × impact, both 1-5) — never AI-guessed.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card glass>
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground">Total risks</p>
            <p className="text-2xl font-semibold text-foreground">{summary.total}</p>
          </CardContent>
        </Card>
        <Card glass>
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground">Open / mitigating</p>
            <p className="text-2xl font-semibold text-foreground">{summary.openCount}</p>
          </CardContent>
        </Card>
        <Card glass>
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground">Critical &amp; open</p>
            <p className="text-2xl font-semibold text-foreground">{summary.criticalOpenCount}</p>
          </CardContent>
        </Card>
        <Card glass>
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground">By band</p>
            <p className="text-xs text-foreground">
              L {summary.byBand.LOW} · M {summary.byBand.MEDIUM} · H {summary.byBand.HIGH} · C {summary.byBand.CRITICAL}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card glass>
        <CardHeader>
          <CardTitle>Add a risk</CardTitle>
          <CardDescription>Real register entries only — never a placeholder row.</CardDescription>
        </CardHeader>
        <CardContent>
          <CreateRiskForm />
        </CardContent>
      </Card>

      <Card glass>
        <CardHeader>
          <CardTitle>All risks</CardTitle>
          <CardDescription>{risks.length} total, sorted by status then score.</CardDescription>
        </CardHeader>
        <CardContent>
          {risks.length === 0 ? (
            <p className="text-sm text-muted-foreground">No risks recorded yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Band</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Reviewed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {risks.map((risk) => (
                  <TableRow key={risk.id}>
                    <TableCell className="max-w-[280px] text-foreground">
                      <p className="truncate font-medium">{risk.title}</p>
                      <p className="truncate text-xs text-muted-foreground">{risk.description}</p>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{risk.category.replace(/_/g, " ")}</TableCell>
                    <TableCell className="text-foreground">
                      {risk.riskScore} ({risk.likelihood}×{risk.impact})
                    </TableCell>
                    <TableCell>
                      <Badge variant={BAND_VARIANT[risk.band] ?? "outline"}>{risk.band}</Badge>
                    </TableCell>
                    <TableCell>
                      <RiskStatusControl riskId={risk.id} status={risk.status} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatDateTime(risk.reviewedAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </Container>
  );
}
