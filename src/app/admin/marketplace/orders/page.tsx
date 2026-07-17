import { Container } from "@/components/ui/container";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { prisma } from "@/lib/prisma";
import { requirePlatformOwner } from "@/lib/billing/platform-admin";
import { formatRelativeTime } from "@/lib/utils";
import { RefundOrderButton } from "./_components/refund-order-button";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "accent"> = {
  PENDING: "secondary",
  PAID: "default",
  FAILED: "outline",
  REFUNDED: "outline",
  CANCELED: "outline",
};

export default async function AdminMarketplaceOrdersPage() {
  await requirePlatformOwner("/admin/marketplace/orders");

  const orders = await prisma.marketplaceOrder.findMany({
    include: { listing: { select: { name: true } }, organization: { select: { name: true } }, buyerUser: { select: { email: true, name: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <Container className="flex flex-col gap-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Marketplace Orders</h1>
        <p className="text-sm text-muted-foreground">Every real marketplace purchase across the platform — {orders.length} total, backed by a real PlatformInvoice/PlatformPayment.</p>
      </div>

      <Card glass>
        <CardHeader>
          <CardTitle>Orders</CardTitle>
          <CardDescription>Most recent first.</CardDescription>
        </CardHeader>
        <CardContent>
          {orders.length === 0 ? (
            <p className="text-sm text-muted-foreground">No orders yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Listing</TableHead>
                  <TableHead>Organization</TableHead>
                  <TableHead>Buyer</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Gateway</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>When</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell>{order.listing.name}</TableCell>
                    <TableCell>{order.organization.name}</TableCell>
                    <TableCell>{order.buyerUser.name ?? order.buyerUser.email}</TableCell>
                    <TableCell>
                      {(order.amountCents / 100).toFixed(2)} {order.currency}
                    </TableCell>
                    <TableCell>{order.gatewayProvider ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[order.status]}>{order.status}</Badge>
                    </TableCell>
                    <TableCell>{formatRelativeTime(order.createdAt)}</TableCell>
                    <TableCell>{order.status === "PAID" && <RefundOrderButton orderId={order.id} />}</TableCell>
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
