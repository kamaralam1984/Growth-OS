import Link from "next/link";
import { FileText, ShieldCheck, ThumbsUp, ThumbsDown, TrendingUp, Receipt, FileSignature, AlertTriangle } from "lucide-react";

import { Container } from "@/components/ui/container";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import { requireActiveMembership } from "../_lib/require-membership";
import { formatCurrency } from "../_lib/format";
import { MetricCard } from "../_components/metric-card";
import { getDocumentDashboardMetrics } from "./_lib/metrics";

export default async function ProposalDashboardPage() {
  const { membership } = await requireActiveMembership("/dashboard/proposal");
  const organizationId = membership.organizationId;
  const currency = membership.organization.currency;

  const [metrics, recentProposals, recentContracts, recentInvoices] = await Promise.all([
    getDocumentDashboardMetrics(organizationId),
    prisma.proposal.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" }, take: 5, select: { id: true, title: true, status: true, createdAt: true } }),
    prisma.contract.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" }, take: 5, select: { id: true, title: true, status: true, contractNumber: true } }),
    prisma.invoice.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" }, take: 5, select: { id: true, invoiceNumber: true, status: true, grandTotal: true } }),
  ]);

  return (
    <main className="py-8">
      <Container className="flex flex-col gap-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Documents Dashboard</h1>
          <p className="text-sm text-muted-foreground">AI Proposal Generator &amp; Enterprise Document Management — real numbers across every document type.</p>
        </div>

        <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <MetricCard icon={FileText} label="Proposals created" value={metrics.proposalsCreated} href="/dashboard/proposal/proposals" />
          <MetricCard icon={ShieldCheck} label="Pending approvals" value={metrics.pendingApprovals} />
          <MetricCard icon={ThumbsUp} label="Accepted" value={metrics.accepted} />
          <MetricCard icon={ThumbsDown} label="Rejected" value={metrics.rejected} />
        </section>

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <MetricCard icon={TrendingUp} label="Revenue forecast" value={formatCurrency(metrics.revenueForecast, currency)} sublabel="Open proposals + quotations" />
          <MetricCard
            icon={Receipt}
            label="Invoices outstanding"
            value={formatCurrency(metrics.invoicesOutstanding, currency)}
            sublabel={`${metrics.invoicesCount} invoices${metrics.invoicesOverdueCount > 0 ? ` · ${metrics.invoicesOverdueCount} overdue` : ""}`}
            href="/dashboard/proposal/invoices"
          />
          <MetricCard icon={FileSignature} label="Contracts" value={metrics.contractsCount} sublabel={`${metrics.contractsSignedCount} signed`} href="/dashboard/proposal/contracts" />
        </section>

        {metrics.invoicesOverdueCount > 0 && (
          <Card className="border-destructive/40">
            <CardContent className="flex items-center gap-3 p-4 text-sm">
              <AlertTriangle className="size-4 shrink-0 text-destructive" />
              <span className="text-foreground">{metrics.invoicesOverdueCount} invoice(s) are overdue.</span>
              <Link href="/dashboard/proposal/invoices" className="ml-auto text-primary hover:underline">
                Review →
              </Link>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Card glass>
            <CardHeader>
              <CardTitle className="text-base">Recent Proposals</CardTitle>
              <CardDescription>Latest generated proposals.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {recentProposals.length === 0 ? (
                <p className="text-sm text-muted-foreground">None yet.</p>
              ) : (
                recentProposals.map((p) => (
                  <Link key={p.id} href={`/dashboard/proposal/proposals/${p.id}`} className="flex items-center justify-between gap-2 rounded-lg border border-border p-2.5 text-sm hover:bg-accent/30">
                    <span className="truncate text-foreground">{p.title}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{p.status}</span>
                  </Link>
                ))
              )}
            </CardContent>
          </Card>

          <Card glass>
            <CardHeader>
              <CardTitle className="text-base">Recent Contracts</CardTitle>
              <CardDescription>Latest generated contracts.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {recentContracts.length === 0 ? (
                <p className="text-sm text-muted-foreground">None yet.</p>
              ) : (
                recentContracts.map((c) => (
                  <Link key={c.id} href={`/dashboard/proposal/contracts/${c.id}`} className="flex items-center justify-between gap-2 rounded-lg border border-border p-2.5 text-sm hover:bg-accent/30">
                    <span className="truncate text-foreground">{c.title}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{c.status}</span>
                  </Link>
                ))
              )}
            </CardContent>
          </Card>

          <Card glass>
            <CardHeader>
              <CardTitle className="text-base">Recent Invoices</CardTitle>
              <CardDescription>Latest invoices.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {recentInvoices.length === 0 ? (
                <p className="text-sm text-muted-foreground">None yet.</p>
              ) : (
                recentInvoices.map((inv) => (
                  <Link key={inv.id} href={`/dashboard/proposal/invoices/${inv.id}`} className="flex items-center justify-between gap-2 rounded-lg border border-border p-2.5 text-sm hover:bg-accent/30">
                    <span className="truncate text-foreground">{inv.invoiceNumber}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{formatCurrency(inv.grandTotal, currency)}</span>
                  </Link>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </Container>
    </main>
  );
}
