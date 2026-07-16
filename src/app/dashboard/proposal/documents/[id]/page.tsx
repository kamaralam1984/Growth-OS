import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Eye, Download } from "lucide-react";

import { Container } from "@/components/ui/container";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/prisma";
import { listDocumentVersions } from "@/lib/documents";
import { requireActiveMembership } from "@/app/dashboard/_lib/require-membership";
import { DocumentExportBar } from "../../_components/document-export-bar";
import { SendDocumentForm } from "../../_components/send-document-form";
import { SignatureRequestForm } from "../../_components/signature-request-form";
import { VersionHistoryPanel } from "../../_components/version-history-panel";
import { SIGNATURE_KINDS } from "../../_lib/business-document-blueprint";
import { sendBusinessDocumentToClient, requestBusinessDocumentSignature } from "../../_lib/business-document-actions";
import { BusinessDocumentStatusSelect } from "./_components/business-document-status-select";

export default async function BusinessDocumentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { membership } = await requireActiveMembership(`/dashboard/proposal/documents/${id}`);

  const document = await prisma.businessDocument.findUnique({ where: { id }, include: { company: { select: { name: true } } } });
  if (!document || document.organizationId !== membership.organizationId) notFound();

  const [versions, signatures] = await Promise.all([
    listDocumentVersions("BUSINESS_DOCUMENT", id),
    prisma.signature.findMany({ where: { docKind: "BUSINESS_DOCUMENT", docId: id }, orderBy: { createdAt: "desc" } }),
  ]);

  return (
    <main className="py-8">
      <Container className="flex max-w-4xl flex-col gap-6">
        <Link href="/dashboard/proposal/documents" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="size-4" /> Back to Legal &amp; Project Docs
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">{document.title}</h1>
            <p className="text-sm text-muted-foreground">
              {document.kind.replace(/_/g, " ")} · {document.company?.name ?? "No company"}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {document.trackingToken && (
                <>
                  <Badge variant="outline"><Eye className="size-3" /> {document.openCount} opens</Badge>
                  <Badge variant="outline"><Download className="size-3" /> {document.downloadCount} downloads</Badge>
                </>
              )}
            </div>
          </div>
          <BusinessDocumentStatusSelect documentId={document.id} status={document.status} />
        </div>

        <DocumentExportBar kindSlug="business-document" id={document.id} />

        <Card glass>
          <CardContent className="p-5">
            <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{document.content}</div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SendDocumentForm documentId={document.id} action={sendBusinessDocumentToClient} />
          {SIGNATURE_KINDS.has(document.kind) && <SignatureRequestForm documentId={document.id} action={requestBusinessDocumentSignature} />}
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
