import Link from "next/link";
import { ReceiptText } from "lucide-react";

import { Container } from "@/components/ui/container";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/prisma";
import { formatCurrency } from "../../_lib/format";
import { requireActiveMembership } from "../../_lib/require-membership";
import { QuotationForm } from "./_components/quotation-form";

const STATUS_VARIANT: Record<string, "outline" | "accent" | "default" | "secondary"> = {
  DRAFT: "outline",
  SENT: "accent",
  ACCEPTED: "default",
  REJECTED: "secondary",
  EXPIRED: "secondary",
};

export default async function QuotationsPage() {
  const { membership } = await requireActiveMembership("/dashboard/proposal/quotations");
  const organizationId = membership.organizationId;

  const [quotations, companies, contacts, deals] = await Promise.all([
    prisma.quotation.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" }, include: { company: { select: { name: true } } } }),
    prisma.company.findMany({ where: { organizationId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.contact.findMany({ where: { organizationId }, orderBy: { firstName: "asc" }, select: { id: true, firstName: true, lastName: true } }),
    prisma.deal.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" }, take: 100, select: { id: true, name: true } }),
  ]);

  return (
    <main className="py-8">
      <Container className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Quotations</h1>
            <p className="text-sm text-muted-foreground">Line items, discount, GST/tax, and grand total — real, deterministic math every time.</p>
          </div>
          <QuotationForm
            companies={companies}
            contacts={contacts.map((c) => ({ id: c.id, name: `${c.firstName} ${c.lastName ?? ""}`.trim() }))}
            deals={deals}
            currency={membership.organization.currency}
          />
        </div>

        {quotations.length === 0 ? (
          <Card glass>
            <CardContent className="flex flex-col items-center gap-3 p-12 text-center">
              <ReceiptText className="size-8 text-muted-foreground" strokeWidth={1.5} />
              <p className="text-sm text-muted-foreground">No quotations yet.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col gap-2">
            {quotations.map((q) => (
              <Link key={q.id} href={`/dashboard/proposal/quotations/${q.id}`}>
                <Card glass className="transition-transform duration-150 hover:-translate-y-0.5">
                  <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <div>
                      <p className="font-medium text-foreground">
                        {q.title} <span className="text-xs text-muted-foreground">({q.quotationNumber})</span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {q.company?.name ?? "No company"} · {q.createdAt.toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-primary">{formatCurrency(q.grandTotal, q.currency ?? membership.organization.currency)}</span>
                      <Badge variant={STATUS_VARIANT[q.status]}>{q.status}</Badge>
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
