import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Eye, Download } from "lucide-react";

import { Container } from "@/components/ui/container";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/prisma";
import { listDocumentVersions } from "@/lib/documents";
import { requireActiveMembership } from "@/app/dashboard/_lib/require-membership";
import { DocumentExportBar } from "../../_components/document-export-bar";
import { SendDocumentForm } from "../../_components/send-document-form";
import { ApprovalRequestForm } from "../../_components/approval-request-form";
import { VersionHistoryPanel } from "../../_components/version-history-panel";
import { BoardReviewPanel } from "../../_components/board-review-panel";
import { getBoardReviewPanelData } from "@/lib/approval-engine";
import { ProposalEditor } from "../_components/proposal-editor";
import { ProposalSectionsView } from "../_components/proposal-sections-view";
import { ProposalRecommendationsPanel } from "./_components/proposal-recommendations-panel";
import { sendProposalToClient, requestProposalApproval } from "../../actions";
import type { ProposalSections } from "@/lib/ai/document-engine";

export default async function ProposalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { membership } = await requireActiveMembership(`/dashboard/proposal/proposals/${id}`);

  const proposal = await prisma.proposal.findUnique({
    where: { id },
    include: { recommendations: { orderBy: { createdAt: "desc" } } },
  });
  if (!proposal || proposal.organizationId !== membership.organizationId) {
    notFound();
  }

  const [members, versions, boardReviewData] = await Promise.all([
    prisma.membership.findMany({ where: { organizationId: membership.organizationId, status: "ACTIVE" }, include: { user: { select: { id: true, name: true, email: true } } } }),
    listDocumentVersions("PROPOSAL", id),
    getBoardReviewPanelData(membership.organizationId, "PROPOSAL", id),
  ]);

  const sections = proposal.sections as ProposalSections | null;
  const memberOptions = members.map((m) => ({ userId: m.user.id, name: m.user.name, email: m.user.email }));
  const canManage = membership.role === "OWNER" || membership.role === "ADMIN";

  return (
    <main className="py-8">
      <Container className="flex max-w-5xl flex-col gap-6">
        <Link href="/dashboard/proposal/proposals" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="size-4" /> Back to Proposals
        </Link>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {proposal.trackingToken && (
              <>
                <Badge variant="outline">
                  <Eye className="size-3" /> {proposal.openCount} opens
                </Badge>
                <Badge variant="outline">
                  <Download className="size-3" /> {proposal.downloadCount} downloads
                </Badge>
              </>
            )}
            {proposal.sentAt && <span>Sent {proposal.sentAt.toLocaleDateString()}</span>}
            {proposal.acceptedAt && <span className="text-primary">Accepted {proposal.acceptedAt.toLocaleDateString()}</span>}
            {proposal.rejectedAt && <span className="text-destructive">Rejected {proposal.rejectedAt.toLocaleDateString()}</span>}
          </div>
          <DocumentExportBar kindSlug="proposal" id={proposal.id} />
        </div>

        <ProposalEditor
          proposalId={proposal.id}
          initialTitle={proposal.title}
          initialContent={proposal.content}
          initialValue={proposal.value != null ? String(proposal.value) : ""}
          status={proposal.status}
        />

        {sections && <ProposalSectionsView sections={sections} />}

        <BoardReviewPanel docKind="PROPOSAL" docId={proposal.id} canManage={canManage} {...boardReviewData} />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SendDocumentForm documentId={proposal.id} action={sendProposalToClient} />
          <div className="flex flex-col justify-center gap-2 rounded-2xl border border-border p-4">
            <p className="text-sm font-medium text-foreground">Approval</p>
            <ApprovalRequestForm documentId={proposal.id} approvers={memberOptions} action={requestProposalApproval} />
          </div>
        </div>

        <ProposalRecommendationsPanel proposalId={proposal.id} initialRecommendations={proposal.recommendations} />

        <VersionHistoryPanel
          versions={versions.map((v) => ({ id: v.id, versionNumber: v.versionNumber, changeNote: v.changeNote, changedByUserName: v.changedByUser?.name ?? null, createdAt: v.createdAt }))}
        />
      </Container>
    </main>
  );
}
