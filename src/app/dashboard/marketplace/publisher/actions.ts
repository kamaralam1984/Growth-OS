"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

function randomReferralCode(): string {
  return Math.random().toString(36).slice(2, 10).toUpperCase();
}

/** Same generation shape as partner/actions.ts's generateUniqueReferralCode() — reused pattern, kept local since Partner's own helper isn't exported. */
async function generateUniqueReferralCode(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = randomReferralCode();
    const existing = await prisma.partner.findUnique({ where: { referralCode: candidate }, select: { id: true } });
    if (!existing) return candidate;
  }
  throw new Error("Could not generate a unique referral code. Please try again.");
}

export interface ApplyAsPublisherInput {
  displayName: string;
  companyName?: string;
  contactEmail: string;
  website?: string;
  bio?: string;
}

/**
 * Applies the signed-in USER (not any organization — MarketplacePublisher.userId
 * is unique per user, same posture as Partner) to become a marketplace
 * publisher. Creates a real PENDING MarketplacePublisher row, auto-linking
 * (or creating) a real Partner row so payouts always flow through the
 * existing Commission/Payout mechanism — never a parallel earnings system.
 * A platform operator later flips PENDING -> APPROVED, same no-self-service
 * posture as Partner approval.
 */
export async function applyAsPublisher(input: ApplyAsPublisherInput): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const displayName = input.displayName.trim();
  const contactEmail = input.contactEmail.trim().toLowerCase();
  if (!displayName) return { ok: false, error: "Give your publisher profile a name." };
  if (!contactEmail || !contactEmail.includes("@")) return { ok: false, error: "Enter a valid contact email." };

  const existing = await prisma.marketplacePublisher.findUnique({ where: { userId } });
  if (existing) return { ok: false, error: "You already have a publisher application." };

  let partner = await prisma.partner.findUnique({ where: { userId } });
  if (!partner) {
    const referralCode = await generateUniqueReferralCode();
    partner = await prisma.partner.create({ data: { userId, referralCode, status: "PENDING" } });
  }

  const publisher = await prisma.marketplacePublisher.create({
    data: {
      userId,
      partnerId: partner.id,
      displayName,
      companyName: input.companyName?.trim() || null,
      contactEmail,
      website: input.website?.trim() || null,
      bio: input.bio?.trim() || null,
      status: "PENDING",
    },
  });

  await logAudit({ userId, action: "marketplace.publisher_applied", metadata: { publisherId: publisher.id } });
  revalidatePath("/dashboard/marketplace/publisher");
  return { ok: true };
}

export interface UpdatePublisherProfileInput {
  displayName?: string;
  companyName?: string | null;
  website?: string | null;
  bio?: string | null;
}

export async function updatePublisherProfile(input: UpdatePublisherProfileInput): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const publisher = await prisma.marketplacePublisher.findUnique({ where: { userId } });
  if (!publisher) return { ok: false, error: "You don't have a publisher profile yet." };

  await prisma.marketplacePublisher.update({
    where: { id: publisher.id },
    data: {
      displayName: input.displayName?.trim() || undefined,
      companyName: input.companyName === undefined ? undefined : input.companyName?.trim() || null,
      website: input.website === undefined ? undefined : input.website?.trim() || null,
      bio: input.bio === undefined ? undefined : input.bio?.trim() || null,
    },
  });

  await logAudit({ userId, action: "marketplace.publisher_profile_updated", metadata: { publisherId: publisher.id } });
  revalidatePath("/dashboard/marketplace/publisher");
  return { ok: true };
}
