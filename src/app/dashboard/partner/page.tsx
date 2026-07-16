import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getAppBaseUrl } from "@/lib/outreach/tracking";
import { Container } from "@/components/ui/container";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { ApplyPartnerForm } from "./_components/apply-partner-form";
import { CopyReferralLink } from "./_components/copy-referral-link";
import { RequestPayoutButton } from "./_components/request-payout-button";

const COMMISSION_STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "accent"> = {
  PENDING: "secondary",
  APPROVED: "accent",
  PAID: "default",
  VOID: "outline",
};

const PAYOUT_STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "accent"> = {
  PENDING: "secondary",
  PAID: "default",
};

function formatMoney(amountCents: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amountCents / 100);
  } catch {
    return `${(amountCents / 100).toFixed(2)} ${currency}`;
  }
}

function formatDate(date: Date | null): string {
  if (!date) return "—";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** Real, PAID-only revenue an organization contributes when checking "did this referral convert to paying" — mirrors the honest signal used elsewhere in this app (currentPlanId set, or the legacy `plan` enum moved off FREE) that a BillingAccount is on a genuinely paid plan, not just present. */
function isPayingAccount(billingAccount: { status: string; currentPlanId: string | null; plan: string } | null): boolean {
  if (!billingAccount) return false;
  if (billingAccount.status !== "ACTIVE") return false;
  return Boolean(billingAccount.currentPlanId) || billingAccount.plan !== "FREE";
}

export default async function PartnerPage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    redirect(`/login?callbackUrl=${encodeURIComponent("/dashboard/partner")}`);
  }

  const partner = await prisma.partner.findUnique({ where: { userId } });

  if (!partner) {
    return (
      <Container className="flex flex-col gap-6 py-8">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Partner Portal</h1>
          <p className="text-sm text-muted-foreground">
            Refer new organizations to KVL GrowthOS and earn a real commission on what they pay.
          </p>
        </div>
        <ApplyPartnerForm />
      </Container>
    );
  }

  const [referredOrganizations, commissions, payouts] = await Promise.all([
    prisma.organization.findMany({
      where: { referredByPartnerId: partner.id },
      include: { billingAccount: { select: { status: true, currentPlanId: true, plan: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.commission.findMany({ where: { partnerId: partner.id }, orderBy: { createdAt: "desc" } }),
    prisma.payout.findMany({
      where: { partnerId: partner.id },
      include: { _count: { select: { commissions: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  // Commission rows only carry a plain organizationId (no Prisma relation is
  // declared on Commission -> Organization), so the org name is resolved
  // with a small manual lookup rather than an `include`.
  const commissionOrgIds = Array.from(new Set(commissions.map((c) => c.organizationId)));
  const knownOrgIds = new Set(referredOrganizations.map((o) => o.id));
  const missingOrgIds = commissionOrgIds.filter((id) => !knownOrgIds.has(id));
  const extraOrgs = missingOrgIds.length
    ? await prisma.organization.findMany({ where: { id: { in: missingOrgIds } }, select: { id: true, name: true } })
    : [];
  const orgNameById = new Map<string, string>([
    ...referredOrganizations.map((o) => [o.id, o.name] as const),
    ...extraOrgs.map((o) => [o.id, o.name] as const),
  ]);

  const totalReferred = referredOrganizations.length;
  const payingCount = referredOrganizations.filter((o) => isPayingAccount(o.billingAccount)).length;
  const conversionRate = totalReferred > 0 ? (payingCount / totalReferred) * 100 : 0;

  const commissionTotalsByCurrency = new Map<string, Map<string, number>>();
  for (const commission of commissions) {
    const byStatus = commissionTotalsByCurrency.get(commission.currency) ?? new Map<string, number>();
    byStatus.set(commission.status, (byStatus.get(commission.status) ?? 0) + commission.amountCents);
    commissionTotalsByCurrency.set(commission.currency, byStatus);
  }

  const hasApprovedUnpaid = commissions.some((c) => c.status === "APPROVED" && !c.payoutId);
  const referralLink = `${getAppBaseUrl()}/register?ref=${partner.referralCode}`;

  return (
    <Container className="flex flex-col gap-6 py-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Partner Portal</h1>
          <p className="text-sm text-muted-foreground">
            Your reseller account — status{" "}
            <Badge variant={partner.status === "ACTIVE" ? "accent" : partner.status === "SUSPENDED" ? "outline" : "secondary"}>
              {partner.status}
            </Badge>
          </p>
        </div>
      </div>

      {partner.status !== "ACTIVE" && (
        <Card glass>
          <CardContent className="p-5 text-sm text-muted-foreground">
            {partner.status === "PENDING"
              ? "Your application is pending review by a platform operator. Your referral link works and referrals are tracked already, but commissions only start accruing once you're approved."
              : "Your partner account has been suspended by a platform operator. Contact support for details."}
          </CardContent>
        </Card>
      )}

      <Card glass>
        <CardHeader>
          <CardTitle>Your referral link</CardTitle>
          <CardDescription>
            Referral code <span className="font-mono text-foreground">{partner.referralCode}</span> — anyone who
            registers through this link has their organization tied to you via
            <span className="font-mono"> Organization.referredByPartnerId</span>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CopyReferralLink link={referralLink} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card glass>
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground">Referred organizations</p>
            <p className="mt-1 text-2xl font-semibold text-foreground">{totalReferred}</p>
          </CardContent>
        </Card>
        <Card glass>
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground">Converted to paying</p>
            <p className="mt-1 text-2xl font-semibold text-foreground">{payingCount}</p>
          </CardContent>
        </Card>
        <Card glass>
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground">Conversion rate</p>
            <p className="mt-1 text-2xl font-semibold text-foreground">{conversionRate.toFixed(1)}%</p>
          </CardContent>
        </Card>
      </div>

      <Card glass>
        <CardHeader>
          <CardTitle>Commission totals</CardTitle>
          <CardDescription>
            Grouped by currency and status — PENDING commissions still await operator approval, APPROVED ones are
            eligible for your next payout request, PAID ones have already been sent out.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {commissionTotalsByCurrency.size === 0 ? (
            <p className="text-sm text-muted-foreground">No commissions yet.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {Array.from(commissionTotalsByCurrency.entries()).map(([currency, byStatus]) => (
                <div key={currency} className="flex flex-wrap items-center gap-3 text-sm">
                  <span className="font-medium text-foreground">{currency}</span>
                  {Array.from(byStatus.entries()).map(([status, amountCents]) => (
                    <Badge key={status} variant={COMMISSION_STATUS_VARIANT[status] ?? "outline"}>
                      {status}: {formatMoney(amountCents, currency)}
                    </Badge>
                  ))}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card glass>
        <CardHeader>
          <CardTitle>Commissions</CardTitle>
        </CardHeader>
        <CardContent>
          {commissions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No commissions yet — they&apos;re generated automatically when a referred organization makes a successful payment.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Organization</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {commissions.map((commission) => (
                  <TableRow key={commission.id}>
                    <TableCell className="text-foreground">
                      {orgNameById.get(commission.organizationId) ?? "Unknown organization"}
                    </TableCell>
                    <TableCell>{formatMoney(commission.amountCents, commission.currency)}</TableCell>
                    <TableCell>
                      <Badge variant={COMMISSION_STATUS_VARIANT[commission.status] ?? "outline"}>{commission.status}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(commission.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card glass>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle>Payouts</CardTitle>
            <CardDescription>
              Requesting a payout bundles every APPROVED, not-yet-paid-out commission into a new PENDING payout
              record. Actually sending funds is a manual step a platform operator performs afterward.
            </CardDescription>
          </div>
          <RequestPayoutButton disabled={partner.status !== "ACTIVE" || !hasApprovedUnpaid} />
        </CardHeader>
        <CardContent>
          {payouts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No payouts requested yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Commissions</TableHead>
                  <TableHead>Requested</TableHead>
                  <TableHead>Paid</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payouts.map((payout) => (
                  <TableRow key={payout.id}>
                    <TableCell>{formatMoney(payout.amountCents, payout.currency)}</TableCell>
                    <TableCell>
                      <Badge variant={PAYOUT_STATUS_VARIANT[payout.status] ?? "outline"}>{payout.status}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{payout._count.commissions}</TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(payout.createdAt)}</TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(payout.paidAt)}</TableCell>
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
