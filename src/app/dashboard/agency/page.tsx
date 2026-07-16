import Link from "next/link";
import { Building2, ExternalLink } from "lucide-react";

import { Container } from "@/components/ui/container";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { prisma } from "@/lib/prisma";
import { getCurrentStateUsageBatchUsersAndProjects } from "@/lib/billing/usage-metering";
import { requireActiveMembership } from "../_lib/require-membership";
import { CreateTenantForm } from "./_components/create-tenant-form";

const AGENCY_ADMIN_ROLES = new Set(["OWNER", "ADMIN"]);

const BILLING_STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "accent"> = {
  ACTIVE: "accent",
  TRIALING: "secondary",
  PAST_DUE: "outline",
  CANCELED: "outline",
  PAUSED: "secondary",
  INCOMPLETE: "outline",
};

function formatMoney(amountCents: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amountCents / 100);
  } catch {
    return `${(amountCents / 100).toFixed(2)} ${currency}`;
  }
}

export default async function AgencyPage() {
  const { userId, membership } = await requireActiveMembership("/dashboard/agency");
  const organization = membership.organization;

  if (!organization.isAgency) {
    return (
      <Container className="py-8">
        <Card glass className="max-w-xl">
          <CardHeader>
            <CardTitle>Agency Portal isn&apos;t enabled</CardTitle>
            <CardDescription>
              Agency mode lets one organization create and manage child tenant organizations under it. It isn&apos;t
              self-service — ask a platform operator to enable Agency mode for {organization.name}.
            </CardDescription>
          </CardHeader>
        </Card>
      </Container>
    );
  }

  const isPrivileged = AGENCY_ADMIN_ROLES.has(membership.role);

  const managedOrganizations = await prisma.organization.findMany({
    where: { parentAgencyOrganizationId: organization.id },
    include: { billingAccount: { include: { currentPlan: true } } },
    orderBy: { createdAt: "desc" },
  });

  const managedOrgIds = managedOrganizations.map((o) => o.id);
  // Batched (2 groupBy queries total, not 2×N managed orgs) — see getCurrentStateUsageBatchUsersAndProjects.
  const usageByOrgId = await getCurrentStateUsageBatchUsersAndProjects(managedOrgIds);

  const revenueByCurrency = managedOrgIds.length
    ? await prisma.platformPayment.groupBy({
        by: ["currency"],
        where: { organizationId: { in: managedOrgIds }, status: "SUCCEEDED" },
        _sum: { amountCents: true },
      })
    : [];

  const partner = await prisma.partner.findUnique({ where: { userId } });
  const commissionFromManagedOrgs =
    partner && managedOrgIds.length
      ? await prisma.commission.groupBy({
          by: ["currency", "status"],
          where: { partnerId: partner.id, organizationId: { in: managedOrgIds } },
          _sum: { amountCents: true },
        })
      : [];

  return (
    <Container className="flex flex-col gap-6 py-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Agency Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Every client organization {organization.name} manages, with its plan, billing status, and live usage.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/settings/white-label"
            className="flex items-center gap-1.5 text-sm text-primary hover:underline"
          >
            White Label Settings <ExternalLink className="size-3.5" />
          </Link>
          {isPrivileged && <CreateTenantForm agencyOrganizationId={organization.id} />}
        </div>
      </div>

      <Card glass>
        <CardHeader>
          <CardTitle>Client organizations</CardTitle>
        </CardHeader>
        <CardContent>
          {managedOrganizations.length === 0 ? (
            <div className="flex flex-col items-center gap-3 p-8 text-center">
              <Building2 className="size-8 text-muted-foreground" strokeWidth={1.5} />
              <p className="text-sm text-muted-foreground">
                No client organizations yet. {isPrivileged ? "Create your first one above." : "Ask an owner or admin to create one."}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Organization</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Billing status</TableHead>
                  <TableHead>Members</TableHead>
                  <TableHead>Projects</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {managedOrganizations.map((org) => {
                  const usage = usageByOrgId.get(org.id);
                  return (
                    <TableRow key={org.id}>
                      <TableCell className="text-foreground">{org.name}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {org.billingAccount?.currentPlan?.name ?? org.billingAccount?.plan ?? "No billing account"}
                      </TableCell>
                      <TableCell>
                        {org.billingAccount ? (
                          <Badge variant={BILLING_STATUS_VARIANT[org.billingAccount.status] ?? "outline"}>
                            {org.billingAccount.status}
                          </Badge>
                        ) : (
                          <Badge variant="outline">No account</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{usage?.members ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{usage?.projects ?? "—"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card glass>
        <CardHeader>
          <CardTitle>Revenue Dashboard</CardTitle>
          <CardDescription>
            Real, collected billing revenue across every client organization above (successful platform payments
            only).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {revenueByCurrency.length === 0 ? (
            <p className="text-sm text-muted-foreground">No successful payments recorded yet across your client organizations.</p>
          ) : (
            <div className="flex flex-wrap gap-3">
              {revenueByCurrency.map((row) => (
                <Badge key={row.currency} variant="accent">
                  {row.currency}: {formatMoney(row._sum.amountCents ?? 0, row.currency)}
                </Badge>
              ))}
            </div>
          )}

          <div className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
            {partner ? (
              commissionFromManagedOrgs.length > 0 ? (
                <>
                  <p className="mb-2 text-foreground">
                    Your commission cut as a Partner, earned specifically from these client organizations:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {commissionFromManagedOrgs.map((row) => (
                      <Badge key={`${row.currency}-${row.status}`} variant="outline">
                        {row.currency} {row.status}: {formatMoney(row._sum.amountCents ?? 0, row.currency)}
                      </Badge>
                    ))}
                  </div>
                </>
              ) : (
                <p>
                  You already have a Partner account, but none of these client organizations are tied to it via{" "}
                  <span className="font-mono">referredByPartnerId</span> yet, so there&apos;s no commission to show
                  from them specifically.
                </p>
              )
            ) : (
              <p>
                The revenue above is your client organizations&apos; total collected billing — it isn&apos;t
                automatically a cut for you. To actually earn a commission on it, the person representing this
                agency needs their own real{" "}
                <Link href="/dashboard/partner" className="text-primary hover:underline">
                  Partner account
                </Link>
                , with these client organizations referred through that partner&apos;s referral link (setting
                <span className="font-mono"> Organization.referredByPartnerId</span>). Real commission tracking lives
                in the Partner Portal&apos;s Commissions table, not as a separate revenue-share ledger here.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card glass>
        <CardHeader>
          <CardTitle>Support tickets</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Support tickets aren&apos;t a separate module in this app yet — there&apos;s no ticket-shaped model that
            genuinely fits a client submitting a support request to their agency (BugReport is project-scoped bug
            tracking; ActionItem is meeting/decision-derived task tracking — neither models an inbound client
            support conversation). Use each client organization&apos;s own real communication channels (its
            projects, comments, and outreach tools) until a dedicated ticketing model is built.
          </p>
        </CardContent>
      </Card>
    </Container>
  );
}
