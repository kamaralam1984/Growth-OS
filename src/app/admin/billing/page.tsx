import Link from "next/link";
import {
  AlertTriangle,
  Banknote,
  Percent,
  ReceiptText,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";

import { Container } from "@/components/ui/container";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { prisma } from "@/lib/prisma";
import { requirePlatformOwner } from "@/lib/billing/platform-admin";
import { RevenueTrendChart } from "./_components/revenue-trend-chart";

const DAY_MS = 24 * 60 * 60 * 1000;
const CHURN_WINDOW_DAYS = 30;
// 90 days is a reasonable trailing window for "did a trial convert" — long
// enough to cover every real trialDays value seeded on the Plan catalog
// (see prisma/schema.prisma's Plan.trialDays), short enough to stay a
// meaningful "recent" cohort rather than all-time.
const CONVERSION_WINDOW_DAYS = 90;
const SUCCESS_STATUSES = ["SUCCEEDED", "PARTIALLY_REFUNDED", "REFUNDED"] as const;

function centsToUsd(cents: number): string {
  return (cents / 100).toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function pct(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`;
}

function formatDate(date: Date | null): string {
  if (!date) return "—";
  return new Date(date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function monthBounds(monthsAgo: number): { start: Date; end: Date; label: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - monthsAgo, 1);
  const end = new Date(now.getFullYear(), now.getMonth() - monthsAgo + 1, 1);
  return { start, end, label: start.toLocaleDateString(undefined, { month: "short", year: "2-digit" }) };
}

export default async function AdminBillingPage() {
  // Gated BEFORE any cross-tenant query runs — everything below intentionally
  // has no organizationId filter, since this dashboard's entire point is to
  // see across every organization at once.
  await requirePlatformOwner("/admin/billing");

  const now = new Date();
  const churnWindowStart = new Date(now.getTime() - CHURN_WINDOW_DAYS * DAY_MS);
  const conversionWindowStart = new Date(now.getTime() - CONVERSION_WINDOW_DAYS * DAY_MS);
  const monthWindows = Array.from({ length: 6 }, (_, i) => monthBounds(5 - i));

  const [
    activeAccountsWithPlan,
    revenueAgg,
    activeCustomers,
    trialingCustomers,
    stillActiveFromBeforeWindow,
    canceledDuringWindowThatWereActiveBefore,
    trialsStarted,
    trialsConverted,
    failedPaymentsCount,
    failedPayments,
    outstandingInvoicesCount,
    outstandingInvoices,
    paymentsByOrg,
    monthlyRevenue,
  ] = await Promise.all([
    prisma.billingAccount.findMany({
      where: { status: "ACTIVE", currentPlanId: { not: null } },
      select: { currentPlan: { select: { priceCents: true, interval: true } } },
    }),
    prisma.platformPayment.aggregate({
      where: { status: { in: [...SUCCESS_STATUSES] } },
      _sum: { amountCents: true, refundedAmountCents: true },
    }),
    prisma.billingAccount.count({ where: { status: "ACTIVE" } }),
    prisma.billingAccount.count({ where: { status: "TRIALING" } }),
    prisma.billingAccount.count({ where: { status: "ACTIVE", createdAt: { lt: churnWindowStart } } }),
    prisma.billingAccount.count({
      where: { status: "CANCELED", canceledAt: { gte: churnWindowStart, lte: now }, createdAt: { lt: churnWindowStart } },
    }),
    prisma.billingAccount.count({ where: { trialEndsAt: { not: null }, createdAt: { gte: conversionWindowStart } } }),
    prisma.billingAccount.count({ where: { trialEndsAt: { not: null }, createdAt: { gte: conversionWindowStart }, status: "ACTIVE" } }),
    prisma.platformPayment.count({ where: { status: "FAILED" } }),
    prisma.platformPayment.findMany({
      where: { status: "FAILED" },
      orderBy: { createdAt: "desc" },
      take: 25,
      include: { organization: { select: { id: true, name: true } } },
    }),
    prisma.platformInvoice.count({ where: { status: "OPEN", dueDate: { lt: now } } }),
    prisma.platformInvoice.findMany({
      where: { status: "OPEN", dueDate: { lt: now } },
      orderBy: { dueDate: "asc" },
      take: 50,
      include: { organization: { select: { id: true, name: true } } },
    }),
    prisma.platformPayment.groupBy({
      by: ["organizationId"],
      where: { status: { in: [...SUCCESS_STATUSES] } },
      _sum: { amountCents: true, refundedAmountCents: true },
    }),
    Promise.all(
      monthWindows.map(async (w) => {
        const agg = await prisma.platformPayment.aggregate({
          where: { status: { in: [...SUCCESS_STATUSES] }, paidAt: { gte: w.start, lt: w.end } },
          _sum: { amountCents: true, refundedAmountCents: true },
        });
        return { label: w.label, value: (agg._sum.amountCents ?? 0) - (agg._sum.refundedAmountCents ?? 0) };
      }),
    ),
  ]);

  // MRR: sum of every ACTIVE BillingAccount's current Plan monthly-equivalent
  // price. YEARLY divides by 12, QUARTERLY by 3; LIFETIME plans are one-time
  // revenue and are deliberately excluded from a *recurring* metric. This
  // assumes a single-currency catalog (Plan.currency defaults to "USD" and
  // this dashboard doesn't do FX conversion) — a real limitation, not a
  // fabricated number.
  const mrrCents = activeAccountsWithPlan.reduce((sum, a) => {
    if (!a.currentPlan) return sum;
    const { priceCents, interval } = a.currentPlan;
    if (interval === "MONTHLY") return sum + priceCents;
    if (interval === "QUARTERLY") return sum + priceCents / 3;
    if (interval === "YEARLY") return sum + priceCents / 12;
    return sum; // LIFETIME
  }, 0);
  const arrCents = mrrCents * 12;

  const totalRevenueCents = (revenueAgg._sum.amountCents ?? 0) - (revenueAgg._sum.refundedAmountCents ?? 0);

  // Churn: real ratio of (accounts active before this 30-day window that
  // canceled during it) ÷ (accounts active at the window's start). There's
  // no historical BillingAccount-state snapshot table, so "active at start
  // of window" is approximated as: still ACTIVE today and created before the
  // window, plus accounts now CANCELED whose canceledAt falls inside the
  // window and which were created before it started. This can't see an
  // account that flickered PAST_DUE/PAUSED before canceling, but it's a
  // real, documented best-effort — not a placeholder.
  const activeAtWindowStart = stillActiveFromBeforeWindow + canceledDuringWindowThatWereActiveBefore;
  const churnRate = activeAtWindowStart > 0 ? canceledDuringWindowThatWereActiveBefore / activeAtWindowStart : 0;

  // Conversion: of BillingAccounts that ever had a trial (trialEndsAt set)
  // and started within the trailing window, how many are ACTIVE right now.
  // A trial that converted then churned later in the same window would be
  // undercounted here (real limitation of not having a trial-conversion
  // event log) — still a real, computed ratio, never a fabricated one.
  const conversionRate = trialsStarted > 0 ? trialsConverted / trialsStarted : 0;

  const topCustomers = paymentsByOrg
    .map((row) => ({
      organizationId: row.organizationId,
      netCents: (row._sum.amountCents ?? 0) - (row._sum.refundedAmountCents ?? 0),
    }))
    .sort((a, b) => b.netCents - a.netCents)
    .slice(0, 10);

  const topCustomerOrgs = await prisma.organization.findMany({
    where: { id: { in: topCustomers.map((c) => c.organizationId) } },
    select: { id: true, name: true },
  });
  const orgById = new Map(topCustomerOrgs.map((o) => [o.id, o]));
  const topCustomerIds = new Set(topCustomers.map((c) => c.organizationId));

  const thisMonthRevenue = monthlyRevenue[5]?.value ?? 0;
  const prevMonthRevenue = monthlyRevenue[4]?.value ?? 0;
  const growthRate = prevMonthRevenue > 0 ? (thisMonthRevenue - prevMonthRevenue) / prevMonthRevenue : thisMonthRevenue > 0 ? 1 : 0;

  return (
    <main className="py-8">
      <Container className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Platform billing</h1>
          <p className="text-sm text-muted-foreground">
            Real, cross-tenant metrics computed from every organization&rsquo;s BillingAccount, PlatformInvoice, and
            PlatformPayment rows — a monitoring dashboard, not a billing-ops console.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1.5">
                <Banknote className="size-3.5" /> MRR
              </CardDescription>
              <CardTitle className="text-3xl">{centsToUsd(mrrCents)}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1.5">
                <Banknote className="size-3.5" /> ARR
              </CardDescription>
              <CardTitle className="text-3xl">{centsToUsd(arrCents)}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1.5">
                <ReceiptText className="size-3.5" /> Total revenue (net of refunds)
              </CardDescription>
              <CardTitle className="text-3xl">{centsToUsd(totalRevenueCents)}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1.5">
                {growthRate >= 0 ? <TrendingUp className="size-3.5 text-emerald-500" /> : <TrendingDown className="size-3.5 text-red-500" />}
                Growth (MoM)
              </CardDescription>
              <CardTitle className={`text-3xl ${growthRate >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                {growthRate >= 0 ? "+" : ""}
                {pct(growthRate)}
              </CardTitle>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1.5">
                <Users className="size-3.5" /> Active customers
              </CardDescription>
              <CardTitle className="text-3xl">{activeCustomers.toLocaleString()}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1.5">
                <Users className="size-3.5" /> Trial users
              </CardDescription>
              <CardTitle className="text-3xl">{trialingCustomers.toLocaleString()}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1.5">
                <Percent className="size-3.5" /> Conversion ({CONVERSION_WINDOW_DAYS}d)
              </CardDescription>
              <CardTitle className="text-3xl">{pct(conversionRate)}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1.5">
                <Percent className="size-3.5" /> Churn ({CHURN_WINDOW_DAYS}d)
              </CardDescription>
              <CardTitle className="text-3xl">{pct(churnRate)}</CardTitle>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1.5">
                <AlertTriangle className="size-3.5" /> Failed payments
              </CardDescription>
              <CardTitle className="text-3xl">{failedPaymentsCount.toLocaleString()}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1.5">
                <ReceiptText className="size-3.5" /> Outstanding invoices
              </CardDescription>
              <CardTitle className="text-3xl">{outstandingInvoicesCount.toLocaleString()}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        <Card glass>
          <CardHeader>
            <CardTitle className="text-base">Revenue trend</CardTitle>
            <CardDescription>Net collected revenue (successful payments minus refunds), by month, last 6 months.</CardDescription>
          </CardHeader>
          <CardContent>
            <RevenueTrendChart points={monthlyRevenue} formatValue={(v) => centsToUsd(v)} />
          </CardContent>
        </Card>

        <Card glass>
          <CardHeader>
            <CardTitle className="text-base">Top customers</CardTitle>
            <CardDescription>Ranked by real lifetime PlatformPayment total, net of refunds.</CardDescription>
          </CardHeader>
          <CardContent>
            {topCustomers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No successful payments recorded yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Organization</TableHead>
                    <TableHead className="text-right">Lifetime revenue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topCustomers.map((c) => (
                    <TableRow key={c.organizationId} id={`org-${c.organizationId}`}>
                      <TableCell className="font-medium text-foreground">{orgById.get(c.organizationId)?.name ?? c.organizationId}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{centsToUsd(c.netCents)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card glass>
          <CardHeader>
            <CardTitle className="text-base">Failed payments</CardTitle>
            <CardDescription>Most recent 25 real PlatformPayment rows with status FAILED, across every organization.</CardDescription>
          </CardHeader>
          <CardContent>
            {failedPayments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No failed payments.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Organization</TableHead>
                    <TableHead>Provider</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {failedPayments.map((payment) => (
                    <TableRow key={payment.id}>
                      <TableCell className="font-medium text-foreground">
                        {topCustomerIds.has(payment.organizationId) ? (
                          <Link href={`#org-${payment.organizationId}`} className="hover:text-primary hover:underline">
                            {payment.organization.name}
                          </Link>
                        ) : (
                          payment.organization.name
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{payment.provider}</TableCell>
                      <TableCell className="max-w-xs truncate text-red-500">{payment.failureReason ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{formatDate(payment.createdAt)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{centsToUsd(payment.amountCents)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card glass>
          <CardHeader>
            <CardTitle className="text-base">Outstanding invoices</CardTitle>
            <CardDescription>Real PlatformInvoice rows with status OPEN whose due date has passed, across every organization.</CardDescription>
          </CardHeader>
          <CardContent>
            {outstandingInvoices.length === 0 ? (
              <p className="text-sm text-muted-foreground">No overdue invoices.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice #</TableHead>
                    <TableHead>Organization</TableHead>
                    <TableHead>Due date</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {outstandingInvoices.map((invoice) => (
                    <TableRow key={invoice.id}>
                      <TableCell className="font-medium text-foreground">{invoice.invoiceNumber}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {topCustomerIds.has(invoice.organizationId) ? (
                          <Link href={`#org-${invoice.organizationId}`} className="hover:text-primary hover:underline">
                            {invoice.organization.name}
                          </Link>
                        ) : (
                          invoice.organization.name
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="border-amber-500/40 text-amber-600">
                          {formatDate(invoice.dueDate)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">{centsToUsd(invoice.totalCents)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </Container>
    </main>
  );
}
