import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Eye, Download } from "lucide-react";

import { Container } from "@/components/ui/container";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/prisma";
import { listDocumentVersions } from "@/lib/documents";
import { requireActiveMembership } from "@/app/dashboard/_lib/require-membership";
import { formatCurrency } from "@/app/dashboard/_lib/format";
import { DocumentExportBar } from "../../_components/document-export-bar";
import { SendDocumentForm } from "../../_components/send-document-form";
import { VersionHistoryPanel } from "../../_components/version-history-panel";
import { BoardReviewPanel } from "../../_components/board-review-panel";
import { sendInvoiceToClient } from "../../_lib/invoice-actions";
import { InvoiceStatusSelect } from "./_components/invoice-status-select";
import { RecordPaymentForm } from "./_components/record-payment-form";
import { getBoardReviewPanelData } from "@/lib/approval-engine";

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { membership } = await requireActiveMembership(`/dashboard/proposal/invoices/${id}`);

  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: { lineItems: { orderBy: { order: "asc" } }, company: { select: { name: true } }, client: { select: { name: true } } },
  });
  if (!invoice || invoice.organizationId !== membership.organizationId) notFound();

  const [versions, boardReviewData] = await Promise.all([
    listDocumentVersions("INVOICE", id),
    getBoardReviewPanelData(membership.organizationId, "INVOICE", id),
  ]);
  const currency = invoice.currency ?? membership.organization.currency;
  const balanceDue = invoice.grandTotal - invoice.amountPaid;
  const canManage = membership.role === "OWNER" || membership.role === "ADMIN";

  return (
    <main className="py-8">
      <Container className="flex max-w-4xl flex-col gap-6">
        <Link href="/dashboard/proposal/invoices" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="size-4" /> Back to Invoices
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">{invoice.invoiceNumber}</h1>
            <p className="text-sm text-muted-foreground">
              {invoice.client?.name ?? invoice.company?.name ?? "No client"} · Issued {invoice.issueDate.toLocaleDateString()}
              {invoice.dueDate ? ` · Due ${invoice.dueDate.toLocaleDateString()}` : ""}
              {invoice.isRecurring ? ` · Recurring (${invoice.recurrenceRule})` : ""}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {invoice.trackingToken && (
                <>
                  <Badge variant="outline"><Eye className="size-3" /> {invoice.openCount} opens</Badge>
                  <Badge variant="outline"><Download className="size-3" /> {invoice.downloadCount} downloads</Badge>
                </>
              )}
              {invoice.paidAt && <span className="text-primary">Paid {invoice.paidAt.toLocaleDateString()}</span>}
            </div>
          </div>
          <InvoiceStatusSelect invoiceId={invoice.id} status={invoice.status} />
        </div>

        <DocumentExportBar kindSlug="invoice" id={invoice.id} />

        <Card glass>
          <CardHeader>
            <CardTitle className="text-base">Line Items</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="p-3 font-medium">Description</th>
                    <th className="p-3 font-medium">Qty</th>
                    <th className="p-3 font-medium">Rate</th>
                    <th className="p-3 font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.lineItems.map((li) => (
                    <tr key={li.id} className="border-b border-border last:border-0">
                      <td className="p-3 text-foreground">{li.description}</td>
                      <td className="p-3 text-muted-foreground">{li.quantity}</td>
                      <td className="p-3 text-muted-foreground">{formatCurrency(li.rate, currency)}</td>
                      <td className="p-3 text-foreground">{formatCurrency(li.amount, currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex flex-col items-end gap-1 text-sm">
              <span>Subtotal: <strong className="text-foreground">{formatCurrency(invoice.subtotal, currency)}</strong></span>
              {invoice.discountAmount > 0 && <span>Discount: <strong className="text-foreground">-{formatCurrency(invoice.discountAmount, currency)}</strong></span>}
              {invoice.taxAmount > 0 && <span>Tax: <strong className="text-foreground">{formatCurrency(invoice.taxAmount, currency)}</strong></span>}
              <span className="text-base">Grand Total: <strong className="text-primary">{formatCurrency(invoice.grandTotal, currency)}</strong></span>
              {invoice.amountPaid > 0 && (
                <>
                  <span>Paid: <strong className="text-foreground">{formatCurrency(invoice.amountPaid, currency)}</strong></span>
                  <span>Balance Due: <strong className="text-foreground">{formatCurrency(balanceDue, currency)}</strong></span>
                </>
              )}
            </div>
            <div className="mt-3">
              <RecordPaymentForm invoiceId={invoice.id} balanceDue={balanceDue} />
            </div>
          </CardContent>
        </Card>

        <BoardReviewPanel docKind="INVOICE" docId={invoice.id} canManage={canManage} {...boardReviewData} />

        <SendDocumentForm documentId={invoice.id} action={sendInvoiceToClient} />

        <VersionHistoryPanel versions={versions.map((v) => ({ id: v.id, versionNumber: v.versionNumber, changeNote: v.changeNote, changedByUserName: v.changedByUser?.name ?? null, createdAt: v.createdAt }))} />
      </Container>
    </main>
  );
}
