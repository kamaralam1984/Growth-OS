import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Eye, Download } from "lucide-react";

import { Container } from "@/components/ui/container";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/prisma";
import { listDocumentVersions } from "@/lib/documents";
import { requireActiveMembership } from "@/app/dashboard/_lib/require-membership";
import { formatCurrency } from "@/app/dashboard/_lib/format";
import { DocumentExportBar } from "../../_components/document-export-bar";
import { SendDocumentForm } from "../../_components/send-document-form";
import { ApprovalRequestForm } from "../../_components/approval-request-form";
import { SignatureRequestForm } from "../../_components/signature-request-form";
import { VersionHistoryPanel } from "../../_components/version-history-panel";
import { BoardReviewPanel } from "../../_components/board-review-panel";
import { sendContractToClient, requestContractApproval, requestContractSignature } from "../../_lib/contract-actions";
import { ContractStatusSelect } from "./_components/contract-status-select";
import { getBoardReviewPanelData } from "@/lib/approval-engine";

export default async function ContractDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { membership } = await requireActiveMembership(`/dashboard/proposal/contracts/${id}`);

  const contract = await prisma.contract.findUnique({ where: { id }, include: { client: { select: { name: true } }, company: { select: { name: true } } } });
  if (!contract || contract.organizationId !== membership.organizationId) notFound();

  const [members, versions, signatures, boardReviewData] = await Promise.all([
    prisma.membership.findMany({ where: { organizationId: membership.organizationId, status: "ACTIVE" }, include: { user: { select: { id: true, name: true, email: true } } } }),
    listDocumentVersions("CONTRACT", id),
    prisma.signature.findMany({ where: { docKind: "CONTRACT", docId: id }, orderBy: { createdAt: "desc" } }),
    getBoardReviewPanelData(membership.organizationId, "CONTRACT", id),
  ]);

  const memberOptions = members.map((m) => ({ userId: m.user.id, name: m.user.name, email: m.user.email }));
  const canManage = membership.role === "OWNER" || membership.role === "ADMIN";

  return (
    <main className="py-8">
      <Container className="flex max-w-4xl flex-col gap-6">
        <Link href="/dashboard/proposal/contracts" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="size-4" /> Back to Contracts
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">{contract.title}</h1>
            <p className="text-sm text-muted-foreground">
              {contract.contractNumber} · {contract.type.replace(/_/g, " ")} · {contract.client?.name ?? contract.company?.name ?? "No client"}
              {contract.value != null ? ` · ${formatCurrency(contract.value, membership.organization.currency)}` : ""}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {contract.trackingToken && (
                <>
                  <Badge variant="outline"><Eye className="size-3" /> {contract.openCount} opens</Badge>
                  <Badge variant="outline"><Download className="size-3" /> {contract.downloadCount} downloads</Badge>
                </>
              )}
              {contract.signedAt && <span className="text-primary">Signed {contract.signedAt.toLocaleDateString()}</span>}
            </div>
          </div>
          <ContractStatusSelect contractId={contract.id} status={contract.status} />
        </div>

        <DocumentExportBar kindSlug="contract" id={contract.id} />

        <Card glass>
          <CardContent className="p-5">
            <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{contract.content}</div>
          </CardContent>
        </Card>

        <BoardReviewPanel docKind="CONTRACT" docId={contract.id} canManage={canManage} {...boardReviewData} />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SendDocumentForm documentId={contract.id} action={sendContractToClient} />
          <SignatureRequestForm documentId={contract.id} action={requestContractSignature} />
        </div>

        <div className="rounded-2xl border border-border p-4">
          <p className="mb-2 text-sm font-medium text-foreground">Approval</p>
          <ApprovalRequestForm documentId={contract.id} approvers={memberOptions} action={requestContractApproval} />
        </div>

        {signatures.length > 0 && (
          <Card glass>
            <CardContent className="flex flex-col gap-2 p-4">
              <p className="text-sm font-medium text-foreground">Signature requests</p>
              {signatures.map((s) => (
                <div key={s.id} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{s.signerName} ({s.signerEmail})</span>
                  <Badge variant={s.status === "SIGNED" ? "default" : "outline"}>{s.status}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <VersionHistoryPanel versions={versions.map((v) => ({ id: v.id, versionNumber: v.versionNumber, changeNote: v.changeNote, changedByUserName: v.changedByUser?.name ?? null, createdAt: v.createdAt }))} />
      </Container>
    </main>
  );
}
