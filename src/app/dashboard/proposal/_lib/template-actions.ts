"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { documentTemplateSchema, type DocumentTemplateInput } from "@/lib/validations/documents";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

async function resolveActiveMembership(userId: string) {
  return prisma.membership.findFirst({ where: { userId, status: "ACTIVE" }, orderBy: { createdAt: "asc" } });
}

async function resolveTemplateInOrg(userId: string, templateId: string) {
  const membership = await resolveActiveMembership(userId);
  if (!membership) return null;
  const template = await prisma.documentTemplate.findUnique({ where: { id: templateId } });
  if (!template || template.organizationId !== membership.organizationId) return null;
  return { membership, template };
}

export interface CreateTemplateResult extends ActionResult {
  templateId?: string;
}

export async function createDocumentTemplate(input: DocumentTemplateInput): Promise<CreateTemplateResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const parsed = documentTemplateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the template details." };

  const membership = await resolveActiveMembership(userId);
  if (!membership) return { ok: false, error: "You don't belong to an organization yet." };
  const organizationId = membership.organizationId;

  try {
    const template = await prisma.documentTemplate.create({
      data: {
        organizationId,
        name: parsed.data.name,
        docKind: parsed.data.docKind,
        category: parsed.data.category,
        businessDocKind: parsed.data.businessDocKind,
        contractType: parsed.data.contractType,
        content: parsed.data.content,
        isDefault: parsed.data.isDefault,
        createdByUserId: userId,
      },
    });

    await logAudit({ userId, organizationId, action: "document_template.created", metadata: { templateId: template.id } });
    revalidatePath("/dashboard/proposal/templates");
    return { ok: true, templateId: template.id };
  } catch (error) {
    console.error("[template] createDocumentTemplate failed:", error);
    return { ok: false, error: "Something went wrong creating the template. Please try again." };
  }
}

export async function updateDocumentTemplate(templateId: string, input: DocumentTemplateInput): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const parsed = documentTemplateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the template details." };

  const resolved = await resolveTemplateInOrg(userId, templateId);
  if (!resolved) return { ok: false, error: "Template not found." };

  await prisma.documentTemplate.update({
    where: { id: templateId },
    data: {
      name: parsed.data.name,
      docKind: parsed.data.docKind,
      category: parsed.data.category,
      businessDocKind: parsed.data.businessDocKind,
      contractType: parsed.data.contractType,
      content: parsed.data.content,
      isDefault: parsed.data.isDefault,
    },
  });

  revalidatePath("/dashboard/proposal/templates");
  return { ok: true };
}

export async function deleteDocumentTemplate(templateId: string): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const resolved = await resolveTemplateInOrg(userId, templateId);
  if (!resolved) return { ok: false, error: "Template not found." };

  await prisma.documentTemplate.delete({ where: { id: templateId } });
  await logAudit({ userId, organizationId: resolved.membership.organizationId, action: "document_template.deleted", metadata: { templateId } });
  revalidatePath("/dashboard/proposal/templates");
  return { ok: true };
}
