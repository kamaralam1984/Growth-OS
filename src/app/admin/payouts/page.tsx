import { Container } from "@/components/ui/container";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { prisma } from "@/lib/prisma";
import { requirePlatformOwner } from "@/lib/billing/platform-admin";
import { MarkPaidButton } from "./_components/mark-paid-button";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "accent"> = {
  PENDING: "secondary",
  PAID: "accent",
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

/**
 * Platform-operator-only payout ledger — the manual counterpart to
 * requestPayoutAction (src/app/dashboard/partner/actions.ts): a partner
 * requests a payout (a real, trackable PENDING record); an operator here
 * confirms the funds were actually sent and flips it PAID. Optional per the
 * Phase 18 brief, built because there's otherwise no way to do that short
 * of a direct DB edit.
 */
export default async function AdminPayoutsPage() {
  await requirePlatformOwner("/admin/payouts");

  const payouts = await prisma.payout.findMany({
    include: {
      partner: { include: { user: { select: { email: true, name: true } } } },
      _count: { select: { commissions: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <Container className="flex flex-col gap-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Partner Payouts</h1>
        <p className="text-sm text-muted-foreground">
          Every payout partners have requested. Marking one paid here is a manual confirmation that funds were
          actually sent outside this app (bank transfer, PayPal, etc.) — this pass doesn&apos;t call any real
          payout API.
        </p>
      </div>

      <Card glass>
        <CardHeader>
          <CardTitle>Payouts</CardTitle>
          <CardDescription>{payouts.length} total</CardDescription>
        </CardHeader>
        <CardContent>
          {payouts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No payout requests yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Partner</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Commissions</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Requested</TableHead>
                  <TableHead>Paid</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payouts.map((payout) => (
                  <TableRow key={payout.id}>
                    <TableCell className="text-foreground">
                      {payout.partner.user.name ?? payout.partner.user.email ?? "Unknown"}
                    </TableCell>
                    <TableCell>{formatMoney(payout.amountCents, payout.currency)}</TableCell>
                    <TableCell className="text-muted-foreground">{payout._count.commissions}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[payout.status] ?? "outline"}>{payout.status}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(payout.createdAt)}</TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(payout.paidAt)}</TableCell>
                    <TableCell className="text-right">
                      {payout.status !== "PAID" && <MarkPaidButton payoutId={payout.id} />}
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
