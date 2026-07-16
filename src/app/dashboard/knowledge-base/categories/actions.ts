"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { resolveActiveMembership } from "@/app/dashboard/_lib/require-membership";
import { logAudit } from "@/lib/audit";
import { slugify } from "@/lib/slug";
import type { KnowledgeCategory } from "@/generated/prisma/client";
import { knowledgeCategorySchema, type KnowledgeCategoryInput } from "@/lib/validations/knowledge-category";
import { isPrivilegedRole } from "../_lib/access";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

const LIST_PATH = "/dashboard/knowledge-base/categories";

async function requirePrivilegedMembership(userId: string) {
  const membership = await resolveActiveMembership(userId);
  if (!membership) return { ok: false as const, error: "You don't belong to an organization yet." };
  if (!isPrivilegedRole(membership.role)) {
    return { ok: false as const, error: "Only owners and admins can manage categories." };
  }
  return { ok: true as const, membership };
}

async function generateUniqueCategorySlug(organizationId: string, name: string): Promise<string> {
  const base = slugify(name);
  const existing = await prisma.knowledgeCategory.findUnique({ where: { organizationId_slug: { organizationId, slug: base } } });
  if (!existing) return base;
  for (let attempt = 2; attempt < 50; attempt++) {
    const candidate = `${base}-${attempt}`;
    const collision = await prisma.knowledgeCategory.findUnique({ where: { organizationId_slug: { organizationId, slug: candidate } } });
    if (!collision) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

/** Walks up the parent chain to make sure `candidateParentId` is never `categoryId` itself or one of its own descendants. */
async function isSafeParent(organizationId: string, categoryId: string | null, candidateParentId: string | null): Promise<boolean> {
  if (!candidateParentId) return true;
  if (candidateParentId === categoryId) return false;

  let cursor: string | null = candidateParentId;
  for (let depth = 0; depth < 20 && cursor; depth++) {
    if (cursor === categoryId) return false;
    const node: KnowledgeCategory | null = await prisma.knowledgeCategory.findUnique({ where: { id: cursor } });
    if (!node || node.organizationId !== organizationId) return false;
    cursor = node.parentId;
  }
  return true;
}

export async function createCategory(input: KnowledgeCategoryInput): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const parsed = knowledgeCategorySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the category." };

  const check = await requirePrivilegedMembership(userId);
  if (!check.ok) return { ok: false, error: check.error };
  const organizationId = check.membership.organizationId;

  try {
    if (parsed.data.parentId) {
      const parent = await prisma.knowledgeCategory.findUnique({ where: { id: parsed.data.parentId } });
      if (!parent || parent.organizationId !== organizationId) {
        return { ok: false, error: "Parent category not found." };
      }
    }

    const slug = await generateUniqueCategorySlug(organizationId, parsed.data.name);
    const category = await prisma.knowledgeCategory.create({
      data: {
        organizationId,
        name: parsed.data.name,
        slug,
        description: parsed.data.description,
        parentId: parsed.data.parentId,
      },
    });

    await logAudit({ userId, organizationId, action: "knowledge_base.category_created", metadata: { categoryId: category.id } });

    revalidatePath(LIST_PATH);
    revalidatePath("/dashboard/knowledge-base");
    return { ok: true };
  } catch (error) {
    console.error("[knowledge-base] createCategory failed:", error);
    return { ok: false, error: "Something went wrong creating the category. Please try again." };
  }
}

export async function updateCategory(categoryId: string, input: KnowledgeCategoryInput): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const parsed = knowledgeCategorySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the category." };

  const check = await requirePrivilegedMembership(userId);
  if (!check.ok) return { ok: false, error: check.error };
  const organizationId = check.membership.organizationId;

  try {
    const existing = await prisma.knowledgeCategory.findUnique({ where: { id: categoryId } });
    if (!existing || existing.organizationId !== organizationId) {
      return { ok: false, error: "Category not found." };
    }
    if (!(await isSafeParent(organizationId, categoryId, parsed.data.parentId))) {
      return { ok: false, error: "A category can't be its own parent or descendant." };
    }

    await prisma.knowledgeCategory.update({
      where: { id: categoryId },
      data: {
        name: parsed.data.name,
        description: parsed.data.description,
        parentId: parsed.data.parentId,
      },
    });

    await logAudit({ userId, organizationId, action: "knowledge_base.category_updated", metadata: { categoryId } });

    revalidatePath(LIST_PATH);
    revalidatePath("/dashboard/knowledge-base");
    return { ok: true };
  } catch (error) {
    console.error("[knowledge-base] updateCategory failed:", error);
    return { ok: false, error: "Something went wrong saving the category. Please try again." };
  }
}

export async function deleteCategory(categoryId: string): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const check = await requirePrivilegedMembership(userId);
  if (!check.ok) return { ok: false, error: check.error };
  const organizationId = check.membership.organizationId;

  try {
    const existing = await prisma.knowledgeCategory.findUnique({ where: { id: categoryId } });
    if (!existing || existing.organizationId !== organizationId) {
      return { ok: false, error: "Category not found." };
    }

    // Articles/child categories are never cascade-deleted here — the
    // schema's onDelete: SetNull on both KnowledgeArticle.category and
    // KnowledgeCategory.parent already handles orphaning them safely.
    await prisma.knowledgeCategory.delete({ where: { id: categoryId } });

    await logAudit({ userId, organizationId, action: "knowledge_base.category_deleted", metadata: { categoryId } });

    revalidatePath(LIST_PATH);
    revalidatePath("/dashboard/knowledge-base");
    return { ok: true };
  } catch (error) {
    console.error("[knowledge-base] deleteCategory failed:", error);
    return { ok: false, error: "Something went wrong deleting the category. Please try again." };
  }
}
