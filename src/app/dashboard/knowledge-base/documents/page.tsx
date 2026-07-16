import Link from "next/link";
import { ArrowLeft, FileStack } from "lucide-react";

import { Container } from "@/components/ui/container";
import { Card, CardContent } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import { requireActiveMembership } from "@/app/dashboard/_lib/require-membership";
import { isEmbeddingsConnected } from "@/lib/rag/embeddings";
import { SUPPORTED_INGESTION_EXTENSIONS } from "@/lib/rag/ingestion";
import { UploadDocumentForm } from "./_components/upload-document-form";
import { DocumentsTable } from "./_components/documents-table";
import { EmbeddingsBanner } from "./_components/embeddings-banner";

const EDITOR_ROLES = new Set(["OWNER", "ADMIN"]);

export default async function IngestedDocumentsPage() {
  const { membership } = await requireActiveMembership("/dashboard/knowledge-base/documents");
  const organizationId = membership.organizationId;

  const [documents, embeddingsConnected] = await Promise.all([
    prisma.ingestedDocument.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { chunks: true } } },
    }),
    isEmbeddingsConnected(organizationId),
  ]);

  const canManage = EDITOR_ROLES.has(membership.role);

  const rows = documents.map((doc) => ({
    id: doc.id,
    title: doc.title,
    sourceKind: doc.sourceKind,
    originalFilename: doc.originalFilename,
    status: doc.status,
    error: doc.error,
    chunkCount: doc._count.chunks,
    createdAt: doc.createdAt,
  }));

  return (
    <main className="py-8">
      <Container className="flex flex-col gap-6">
        <Link
          href="/dashboard/knowledge-base"
          className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Back to Knowledge Base
        </Link>

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Ingested Documents</h1>
            <p className="text-sm text-muted-foreground">
              Real uploaded files, parsed, chunked, and embedded for retrieval — nothing here is simulated.
            </p>
          </div>
          {canManage && <UploadDocumentForm supportedExtensions={SUPPORTED_INGESTION_EXTENSIONS} />}
        </div>

        {!embeddingsConnected && <EmbeddingsBanner />}

        {rows.length === 0 ? (
          <Card glass>
            <CardContent className="flex flex-col items-center gap-3 p-12 text-center">
              <FileStack className="size-8 text-muted-foreground" strokeWidth={1.5} />
              <p className="text-sm text-muted-foreground">No documents ingested yet. Upload your first one.</p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-4">
              <DocumentsTable documents={rows} canManage={canManage} />
            </CardContent>
          </Card>
        )}
      </Container>
    </main>
  );
}
