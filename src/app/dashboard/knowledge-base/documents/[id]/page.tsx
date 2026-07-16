import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { Container } from "@/components/ui/container";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/prisma";
import { requireActiveMembership } from "@/app/dashboard/_lib/require-membership";
import { formatRelativeTime } from "@/lib/utils";
import { DocumentStatusBadge } from "../_components/document-status-badge";
import { DocumentStatusPoller } from "../_components/document-status-poller";
import { DocumentDetailActions } from "../_components/document-detail-actions";

const EDITOR_ROLES = new Set(["OWNER", "ADMIN"]);
const CHUNKS_PER_PAGE = 50;

export default async function IngestedDocumentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { id } = await params;
  const { page: pageParam } = await searchParams;
  const { membership } = await requireActiveMembership(`/dashboard/knowledge-base/documents/${id}`);

  const document = await prisma.ingestedDocument.findUnique({
    where: { id },
    include: { uploadedByUser: { select: { name: true, email: true } }, _count: { select: { chunks: true } } },
  });

  if (!document || document.organizationId !== membership.organizationId) {
    notFound();
  }

  const page = Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1);
  const totalChunks = document._count.chunks;
  const totalPages = Math.max(1, Math.ceil(totalChunks / CHUNKS_PER_PAGE));

  const chunks = await prisma.documentChunk.findMany({
    where: { ingestedDocumentId: id },
    orderBy: { chunkIndex: "asc" },
    skip: (page - 1) * CHUNKS_PER_PAGE,
    take: CHUNKS_PER_PAGE,
  });

  const canManage = EDITOR_ROLES.has(membership.role);

  return (
    <main className="py-8">
      <Container className="flex max-w-4xl flex-col gap-6">
        <DocumentStatusPoller status={document.status} />

        <Link
          href="/dashboard/knowledge-base/documents"
          className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Back to Ingested Documents
        </Link>

        <Card>
          <CardHeader className="flex-row items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                {document.title}
                <DocumentStatusBadge status={document.status} />
              </CardTitle>
              <CardDescription className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
                <span>{document.originalFilename ?? document.sourceKind}</span>
                {document.mimeType && <Badge variant="outline">{document.mimeType}</Badge>}
                <span>Uploaded {formatRelativeTime(document.createdAt)}</span>
                {document.uploadedByUser && <span>by {document.uploadedByUser.name ?? document.uploadedByUser.email}</span>}
                <span>{totalChunks} chunk{totalChunks === 1 ? "" : "s"}</span>
              </CardDescription>
            </div>
            {canManage && <DocumentDetailActions documentId={document.id} status={document.status} />}
          </CardHeader>
          {document.status === "FAILED" && document.error && (
            <CardContent className="pt-0">
              <p className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-500">{document.error}</p>
            </CardContent>
          )}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Chunks</CardTitle>
            <CardDescription>Real, persisted DocumentChunk rows this document was split into for retrieval.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {chunks.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {document.status === "READY" ? "This document produced no chunks." : "No chunks yet — still processing."}
              </p>
            ) : (
              <div className="max-h-[32rem] overflow-y-auto rounded-lg border border-border">
                {chunks.map((chunk) => (
                  <div key={chunk.id} className="border-b border-border/60 p-4 last:border-b-0">
                    <div className="mb-1.5 flex items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="outline">#{chunk.chunkIndex}</Badge>
                      {chunk.tokenCount !== null && <span>{chunk.tokenCount} tokens</span>}
                    </div>
                    <p className="line-clamp-4 whitespace-pre-wrap text-sm text-foreground">{chunk.content}</p>
                  </div>
                ))}
              </div>
            )}

            {totalPages > 1 && (
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <Link
                  href={`/dashboard/knowledge-base/documents/${id}?page=${Math.max(1, page - 1)}`}
                  className={page <= 1 ? "pointer-events-none opacity-40" : "hover:text-foreground"}
                >
                  Previous
                </Link>
                <span>
                  Page {page} of {totalPages}
                </span>
                <Link
                  href={`/dashboard/knowledge-base/documents/${id}?page=${Math.min(totalPages, page + 1)}`}
                  className={page >= totalPages ? "pointer-events-none opacity-40" : "hover:text-foreground"}
                >
                  Next
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </Container>
    </main>
  );
}
