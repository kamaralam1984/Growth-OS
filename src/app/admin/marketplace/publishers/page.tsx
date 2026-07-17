import { Container } from "@/components/ui/container";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { prisma } from "@/lib/prisma";
import { requirePlatformOwner } from "@/lib/billing/platform-admin";
import { PublisherStatusSelect } from "./_components/publisher-status-select";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "accent"> = {
  PENDING: "secondary",
  APPROVED: "accent",
  SUSPENDED: "outline",
  REJECTED: "outline",
};

export default async function AdminMarketplacePublishersPage() {
  await requirePlatformOwner("/admin/marketplace/publishers");

  const publishers = await prisma.marketplacePublisher.findMany({
    include: {
      user: { select: { email: true, name: true } },
      partner: { select: { referralCode: true, status: true } },
      _count: { select: { listings: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <Container className="flex flex-col gap-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Marketplace Publisher Approvals</h1>
        <p className="text-sm text-muted-foreground">
          Every marketplace publisher application across the platform. Approving a PENDING publisher also activates
          their linked Partner row, so payouts can flow once they publish a paid listing.
        </p>
      </div>

      <Card glass>
        <CardHeader>
          <CardTitle>Publishers</CardTitle>
          <CardDescription>{publishers.length} total</CardDescription>
        </CardHeader>
        <CardContent>
          {publishers.length === 0 ? (
            <p className="text-sm text-muted-foreground">No publisher applications yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Publisher</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Referral/payout code</TableHead>
                  <TableHead>Listings</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {publishers.map((publisher) => (
                  <TableRow key={publisher.id}>
                    <TableCell>{publisher.displayName}</TableCell>
                    <TableCell>{publisher.user.name ?? publisher.user.email}</TableCell>
                    <TableCell>
                      {publisher.partner ? (
                        <Badge variant="outline">
                          {publisher.partner.referralCode} ({publisher.partner.status})
                        </Badge>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>{publisher._count.listings}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Badge variant={STATUS_VARIANT[publisher.status]}>{publisher.status}</Badge>
                        <PublisherStatusSelect publisherId={publisher.id} status={publisher.status} />
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
