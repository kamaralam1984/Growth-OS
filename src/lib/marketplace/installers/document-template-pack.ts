import { prisma } from "@/lib/prisma";
import type { DocumentKind, DocumentIndustry, BusinessDocumentKind, ContractType, DocumentTemplate } from "@/generated/prisma/client";
import type { DocumentTemplateManifest } from "../manifest-schema";

export interface DocumentTemplatePackInstallResult {
  documentTemplateId: string;
}

/**
 * Creates a real DocumentTemplate via the same field shape
 * createDocumentTemplate() (src/app/dashboard/proposal/_lib/template-actions.ts)
 * uses — serves both the CRM_TEMPLATE and PROPOSAL_TEMPLATE marketplace
 * categories (same underlying model; docKind is what actually differentiates
 * a CRM-flavored template from a proposal one).
 */
export async function installDocumentTemplatePack(organizationId: string, manifest: DocumentTemplateManifest, createdByUserId: string): Promise<DocumentTemplatePackInstallResult> {
  const t = manifest.documentTemplate;
  const template: DocumentTemplate = await prisma.documentTemplate.create({
    data: {
      organizationId,
      name: t.name,
      docKind: t.docKind as DocumentKind,
      category: (t.category ?? null) as DocumentIndustry | null,
      businessDocKind: (t.businessDocKind ?? null) as BusinessDocumentKind | null,
      contractType: (t.contractType ?? null) as ContractType | null,
      content: t.content,
      isDefault: false,
      createdByUserId,
    },
  });

  return { documentTemplateId: template.id };
}

export async function uninstallDocumentTemplatePack(documentTemplateId: string): Promise<void> {
  await prisma.documentTemplate.delete({ where: { id: documentTemplateId } });
}
