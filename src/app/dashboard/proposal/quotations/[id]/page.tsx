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
import { sendQuotationToClient } from "../../_lib/quotation-actions";
import { QuotationStatusSelect } from "./_components/quotation-status-select";
import { getBoardReviewPanelData } from "@/lib/approval-engine";

export default async function QuotationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { membership } = await requireActiveMembership(`/dashboard/proposal/quotations/${id}`);

  const quotation = await prisma.quotation.findUnique({
    where: { id },
    include: { lineItems: { orderBy: { order: "asc" } }, company: { select: { name: true } }, contact: { select: { firstName: true, lastName: true } } },
  });
  if (!quotation || quotation.organizationId !== membership.organizationId) notFound();

  const [versions, boardReviewData] = await Promise.all([
    listDocumentVersions("QUOTATION", id),
    getBoardReviewPanelData(membership.organizationId, "QUOTATION", id),
  ]);
  const currency = quotation.currency ?? membership.organization.currency;
  const canManage = membership.role === "OWNER" || membership.role === "ADMIN";

  return (
    <main className="py-8">
      <Container className="flex max-w-4xl flex-col gap-6">
        <Link href="/dashboard/proposal/quotations" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="size-4" /> Back to Quotations
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">{quotation.title}</h1>
            <p className="text-sm text-muted-foreground">{quotation.quotationNumber} · {quotation.company?.name ?? "No company"}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {quotation.trackingToken && (
                <>
                  <Badge variant="outline"><Eye className="size-3" /> {quotation.openCount} opens</Badge>
                  <Badge variant="outline"><Download className="size-3" /> {quotation.downloadCount} downloads</Badge>
                </>
              )}
            </div>
          </div>
          <QuotationStatusSelect quotationId={quotation.id} status={quotation.status} />
        </div>

        <DocumentExportBar kindSlug="quotation" id={quotation.id} />

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
                  {quotation.lineItems.map((li) => (
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
              <span>Subtotal: <strong className="text-foreground">{formatCurrency(quotation.subtotal, currency)}</strong></span>
              {quotation.discountAmount > 0 && <span>Discount{quotation.discountPercent ? ` (${quotation.discountPercent}%)` : ""}: <strong className="text-foreground">-{formatCurrency(quotation.discountAmount, currency)}</strong></span>}
              {quotation.taxAmount > 0 && <span>Tax{quotation.taxPercent ? ` (${quotation.taxPercent}%)` : ""}: <strong className="text-foreground">{formatCurrency(quotation.taxAmount, currency)}</strong></span>}
              <span className="text-base">Grand Total: <strong className="text-primary">{formatCurrency(quotation.grandTotal, currency)}</strong></span>
            </div>
          </CardContent>
        </Card>

        <BoardReviewPanel docKind="QUOTATION" docId={quotation.id} canManage={canManage} {...boardReviewData} />

        <SendDocumentForm documentId={quotation.id} action={sendQuotationToClient} />

        <VersionHistoryPanel versions={versions.map((v) => ({ id: v.id, versionNumber: v.versionNumber, changeNote: v.changeNote, changedByUserName: v.changedByUser?.name ?? null, createdAt: v.createdAt }))} />
      </Container>
    </main>
  );
}
