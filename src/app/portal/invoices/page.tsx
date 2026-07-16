import { Receipt } from "lucide-react";

import { Container } from "@/components/ui/container";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/prisma";
import { requireClientPortalSession } from "@/lib/client-portal/auth";

function money(value: number, currency?: string | null): string {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: currency || "USD", maximumFractionDigits: 0 }).format(value);
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "accent"> = {
  DRAFT: "outline",
  SENT: "accent",
  PAID: "default",
  OVERDUE: "secondary",
  CANCELLED: "secondary",
  VOID: "secondary",
};

export default async function PortalInvoicesPage() {
  const session = await requireClientPortalSession("/portal/invoices");

  const invoices = await prisma.invoice.findMany({
    where: { clientId: session.client.id },
    orderBy: { issueDate: "desc" },
  });

  return (
    <main className="py-8">
      <Container className="flex flex-col gap-6">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-foreground">
          <Receipt className="size-6" /> Invoices
        </h1>

        {invoices.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">No invoices yet.</CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="flex flex-col divide-y divide-border p-0">
              {invoices.map((invoice) => (
                <div key={invoice.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div>
                    <p className="text-sm font-medium text-foreground">{invoice.invoiceNumber}</p>
                    <p className="text-xs text-muted-foreground">
                      Issued {invoice.issueDate.toLocaleDateString()}
                      {invoice.dueDate ? ` · Due ${invoice.dueDate.toLocaleDateString()}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-foreground">{money(invoice.grandTotal, invoice.currency)}</span>
                    <Badge
                      variant={STATUS_VARIANT[invoice.status] ?? "outline"}
                      className={invoice.status === "OVERDUE" ? "border-destructive/30 bg-destructive/10 text-destructive" : undefined}
                    >
                      {invoice.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </Container>
    </main>
  );
}
