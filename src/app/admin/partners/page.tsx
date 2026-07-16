import { Container } from "@/components/ui/container";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { prisma } from "@/lib/prisma";
import { requirePlatformOwner } from "@/lib/billing/platform-admin";
import { PartnerStatusSelect } from "./_components/partner-status-select";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "accent"> = {
  PENDING: "secondary",
  ACTIVE: "accent",
  SUSPENDED: "outline",
};

/**
 * Platform-operator-only reseller partner approval tool — optional per the
 * Phase 18 brief, built because there's otherwise no way to move a Partner
 * from PENDING to ACTIVE short of a direct DB edit.
 */
export default async function AdminPartnersPage() {
  await requirePlatformOwner("/admin/partners");

  const partners = await prisma.partner.findMany({
    include: {
      user: { select: { email: true, name: true } },
      _count: { select: { referredOrganizations: true, commissions: true, payouts: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <Container className="flex flex-col gap-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Partner Approvals</h1>
        <p className="text-sm text-muted-foreground">
          Every reseller Partner application across the platform. Approving a PENDING partner (setting it ACTIVE) is
          what lets their referral link start generating real commissions.
        </p>
      </div>

      <Card glass>
        <CardHeader>
          <CardTitle>Partners</CardTitle>
          <CardDescription>{partners.length} total</CardDescription>
        </CardHeader>
        <CardContent>
          {partners.length === 0 ? (
            <p className="text-sm text-muted-foreground">No partner applications yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Referral code</TableHead>
                  <TableHead>Commission rate</TableHead>
                  <TableHead>Referred orgs</TableHead>
                  <TableHead>Commissions</TableHead>
                  <TableHead>Payouts</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {partners.map((partner) => (
                  <TableRow key={partner.id}>
                    <TableCell className="text-foreground">{partner.user.name ?? partner.user.email ?? "Unknown"}</TableCell>
                    <TableCell className="font-mono text-xs">{partner.referralCode}</TableCell>
                    <TableCell className="text-muted-foreground">{partner.commissionRatePercent}%</TableCell>
                    <TableCell className="text-muted-foreground">{partner._count.referredOrganizations}</TableCell>
                    <TableCell className="text-muted-foreground">{partner._count.commissions}</TableCell>
                    <TableCell className="text-muted-foreground">{partner._count.payouts}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Badge variant={STATUS_VARIANT[partner.status] ?? "outline"}>{partner.status}</Badge>
                        <PartnerStatusSelect partnerId={partner.id} status={partner.status} />
                      </div>
                    </TableCell>
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
