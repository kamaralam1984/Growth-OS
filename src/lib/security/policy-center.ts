import { prisma } from "@/lib/prisma";
import type { SecurityPolicy, PolicyCategory, PolicyStatus } from "@/generated/prisma/client";

/**
 * SOC2 CC1-CC5 / ISO27001 A.5 information security policy center — real,
 * admin-authored policy documents with version history and a review
 * cadence. Distinct from the static narrative guides in docs/guides/: those
 * are developer-facing documentation, these are the organization's actual
 * governing policies, versioned and queryable for the compliance dashboard.
 */

export interface CreatePolicyInput {
  title: string;
  category: PolicyCategory;
  content: string;
  ownerUserId?: string;
  createdByUserId?: string;
  reviewDueAt?: Date;
}

export async function createPolicy(input: CreatePolicyInput): Promise<SecurityPolicy> {
  return prisma.securityPolicy.create({
    data: {
      title: input.title,
      category: input.category,
      content: input.content,
      ownerUserId: input.ownerUserId || null,
      createdByUserId: input.createdByUserId || null,
      reviewDueAt: input.reviewDueAt || null,
    },
  });
}

export interface UpdatePolicyInput {
  title?: string;
  category?: PolicyCategory;
  content?: string;
  ownerUserId?: string | null;
  reviewDueAt?: Date | null;
  publish?: boolean;
  archive?: boolean;
}

export async function updatePolicy(id: string, input: UpdatePolicyInput): Promise<SecurityPolicy> {
  const existing = await prisma.securityPolicy.findUniqueOrThrow({ where: { id } });
  const contentChanged = input.content !== undefined && input.content !== existing.content;

  let status: PolicyStatus | undefined;
  let publishedAt: Date | undefined;
  if (input.archive) {
    status = "ARCHIVED";
  } else if (input.publish) {
    status = "PUBLISHED";
    publishedAt = new Date();
  }

  return prisma.securityPolicy.update({
    where: { id },
    data: {
      title: input.title,
      category: input.category,
      content: input.content,
      version: contentChanged ? existing.version + 1 : undefined,
      ownerUserId: input.ownerUserId,
      reviewDueAt: input.reviewDueAt,
      status,
      publishedAt,
    },
  });
}

export async function listPolicies(): Promise<SecurityPolicy[]> {
  return prisma.securityPolicy.findMany({ orderBy: [{ status: "asc" }, { updatedAt: "desc" }] });
}

export interface PolicyCenterSummary {
  total: number;
  published: number;
  draft: number;
  overdueForReview: number;
}

export async function getPolicyCenterSummary(): Promise<PolicyCenterSummary> {
  const policies = await prisma.securityPolicy.findMany({ select: { status: true, reviewDueAt: true } });
  const now = new Date();
  let published = 0;
  let draft = 0;
  let overdueForReview = 0;
  for (const p of policies) {
    if (p.status === "PUBLISHED") published++;
    if (p.status === "DRAFT") draft++;
    if (p.reviewDueAt && p.reviewDueAt < now && p.status === "PUBLISHED") overdueForReview++;
  }
  return { total: policies.length, published, draft, overdueForReview };
}
