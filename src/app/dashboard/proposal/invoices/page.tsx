import Link from "next/link";
import { Receipt } from "lucide-react";

import { Container } from "@/components/ui/container";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/prisma";
import { formatCurrency } from "../../_lib/format";
import { requireActiveMembership } from "../../_lib/require-membership";
import { InvoiceForm } from "./_components/invoice-form";

const STATUS_VARIANT: Record<string, "outline" | "accent" | "default" | "secondary"> = {
  DRAFT: "outline",
  SENT: "accent",
  PAID: "default",
  OVERDUE: "secondary",
  CANCELLED: "secondary",
  VOID: "secondary",
};

export default async function InvoicesPage() {
  const { membership } = await requireActiveMembership("/dashboard/proposal/invoices");
  const organizationId = membership.organizationId;

  const [invoices, companies, deals, clients] = await Promise.all([
    prisma.invoice.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" }, include: { company: { select: { name: true } }, client: { select: { name: true } } } }),
    prisma.company.findMany({ where: { organizationId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.deal.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" }, take: 100, select: { id: true, name: true } }),
    prisma.client.findMany({ where: { organizationId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <main className="py-8">
      <Container className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Invoices</h1>
            <p className="text-sm text-muted-foreground">Invoice, GST Invoice, Recurring, Proforma, Credit Note, and Debit Note — real line-item math, overdue detection.</p>
          </div>
          <InvoiceForm companies={companies} deals={deals} clients={clients} currency={membership.organization.currency} />
        </div>

        {invoices.length === 0 ? (
          <Card glass>
            <CardContent className="flex flex-col items-center gap-3 p-12 text-center">
              <Receipt className="size-8 text-muted-foreground" strokeWidth={1.5} />
              <p className="text-sm text-muted-foreground">No invoices yet.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col gap-2">
            {invoices.map((inv) => (
              <Link key={inv.id} href={`/dashboard/proposal/invoices/${inv.id}`}>
                <Card glass className="transition-transform duration-150 hover:-translate-y-0.5">
                  <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <div>
                      <p className="font-medium text-foreground">{inv.invoiceNumber}</p>
                      <p className="text-xs text-muted-foreground">
                        {inv.client?.name ?? inv.company?.name ?? "No client"} · {inv.issueDate.toLocaleDateString()}
                        {inv.dueDate ? ` · Due ${inv.dueDate.toLocaleDateString()}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-primary">{formatCurrency(inv.grandTotal, inv.currency ?? membership.organization.currency)}</span>
                      <Badge variant={STATUS_VARIANT[inv.status]}>{inv.status}</Badge>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </Container>
    </main>
  );
}
