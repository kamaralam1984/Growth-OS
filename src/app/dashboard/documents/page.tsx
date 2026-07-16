import { Container } from "@/components/ui/container";
import { prisma } from "@/lib/prisma";
import { requireActiveMembership } from "../_lib/require-membership";
import { UploadForm } from "./_components/upload-form";
import { DocumentList } from "./_components/document-list";

export default async function DocumentsPage() {
  const { membership } = await requireActiveMembership("/dashboard/documents");

  const [documents, companies] = await Promise.all([
    prisma.document.findMany({
      where: { organizationId: membership.organizationId },
      orderBy: { createdAt: "desc" },
      include: { linkedCompany: { select: { name: true } } },
    }),
    prisma.company.findMany({
      where: { organizationId: membership.organizationId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return (
    <main className="py-8">
      <Container className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Documents</h1>
            <p className="text-sm text-muted-foreground">
              Real file storage — every upload is a genuine file on disk, streamed back only to members of your
              organization.
            </p>
          </div>
          <UploadForm companies={companies} />
        </div>

        <DocumentList
          documents={documents.map((d) => ({
            id: d.id,
            name: d.name,
            folder: d.folder,
            sizeBytes: d.sizeBytes,
            companyName: d.linkedCompany?.name ?? null,
            createdAt: d.createdAt.toISOString(),
          }))}
        />
      </Container>
    </main>
  );
}
