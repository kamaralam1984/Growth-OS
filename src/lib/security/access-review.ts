import { prisma } from "@/lib/prisma";
import type { AccessReview, Prisma } from "@/generated/prisma/client";

/**
 * Periodic RBAC access-review campaign for one organization's own
 * membership roster (SOC2 CC6.1 / ISO 27001 A.9 access-review requirement).
 * `findings` is a real snapshot of ACTIVE memberships taken at campaign
 * start; a CONFIRMED/REVOKED decision is written back into the same entry,
 * never a separate fabricated summary. A REVOKED decision genuinely
 * suspends the membership (MembershipStatus.SUSPENDED) — this isn't just a
 * Json annotation, it actually blocks that member's access everywhere
 * resolveActiveMembership() is used.
 */

export interface AccessReviewFinding {
  membershipId: string;
  userId: string;
  userName: string | null;
  email: string | null;
  role: string;
  decision: "CONFIRMED" | "REVOKED" | null;
  decidedAt: string | null;
}

export async function initiateAccessReview(organizationId: string, initiatedByUserId: string, periodLabel: string): Promise<AccessReview> {
  const memberships = await prisma.membership.findMany({
    where: { organizationId, status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
    include: { user: { select: { id: true, name: true, email: true } } },
  });

  const findings: AccessReviewFinding[] = memberships.map((m) => ({
    membershipId: m.id,
    userId: m.userId,
    userName: m.user.name,
    email: m.user.email,
    role: m.role,
    decision: null,
    decidedAt: null,
  }));

  return prisma.accessReview.create({
    data: {
      organizationId,
      initiatedByUserId,
      periodLabel,
      findings: findings as unknown as Prisma.InputJsonValue,
    },
  });
}

export async function decideAccessReviewEntry(
  reviewId: string,
  organizationId: string,
  membershipId: string,
  decision: "CONFIRMED" | "REVOKED",
): Promise<AccessReview> {
  const review = await prisma.accessReview.findUniqueOrThrow({ where: { id: reviewId } });
  if (review.organizationId !== organizationId) throw new Error("Access review not found.");
  if (review.status === "COMPLETED") throw new Error("This access review is already completed.");

  const findings = review.findings as unknown as AccessReviewFinding[];
  const entry = findings.find((f) => f.membershipId === membershipId);
  if (!entry) throw new Error("That membership isn't part of this access review.");

  if (decision === "REVOKED") {
    const membership = await prisma.membership.findUnique({ where: { id: membershipId } });
    if (membership?.role === "OWNER") {
      const ownerCount = await prisma.membership.count({ where: { organizationId, role: "OWNER", status: "ACTIVE" } });
      if (ownerCount <= 1) throw new Error("An organization needs at least one active owner — cannot revoke the last one.");
    }
    await prisma.membership.updateMany({ where: { id: membershipId, organizationId }, data: { status: "SUSPENDED" } });
  }

  entry.decision = decision;
  entry.decidedAt = new Date().toISOString();

  return prisma.accessReview.update({
    where: { id: reviewId },
    data: { findings: findings as unknown as Prisma.InputJsonValue },
  });
}

export async function completeAccessReview(reviewId: string, organizationId: string): Promise<AccessReview> {
  const review = await prisma.accessReview.findUniqueOrThrow({ where: { id: reviewId } });
  if (review.organizationId !== organizationId) throw new Error("Access review not found.");

  return prisma.accessReview.update({
    where: { id: reviewId },
    data: { status: "COMPLETED", completedAt: new Date() },
  });
}

export async function listAccessReviews(organizationId: string): Promise<AccessReview[]> {
  return prisma.accessReview.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" } });
}
