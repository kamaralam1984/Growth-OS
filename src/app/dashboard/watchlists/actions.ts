"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

async function resolveActiveMembership(userId: string) {
  return prisma.membership.findFirst({
    where: { userId, status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
  });
}

export interface CreateWatchlistResult extends ActionResult {
  watchlistId?: string;
}

export async function createWatchlist(name: string, description?: string): Promise<CreateWatchlistResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };
  if (!name.trim()) return { ok: false, error: "Give the watchlist a name." };

  const membership = await resolveActiveMembership(userId);
  if (!membership) return { ok: false, error: "You don't belong to an organization yet." };

  try {
    const watchlist = await prisma.watchlist.create({
      data: {
        organizationId: membership.organizationId,
        name: name.trim(),
        description: description?.trim() || null,
        createdByUserId: userId,
      },
    });
    await logAudit({
      userId,
      organizationId: membership.organizationId,
      action: "watchlists.watchlist_created",
      metadata: { watchlistId: watchlist.id },
    });
    revalidatePath("/dashboard/watchlists");
    return { ok: true, watchlistId: watchlist.id };
  } catch (error) {
    console.error("[watchlists] createWatchlist failed:", error);
    return { ok: false, error: "Something went wrong creating the watchlist. Please try again." };
  }
}

export async function deleteWatchlist(watchlistId: string): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const membership = await resolveActiveMembership(userId);
  if (!membership) return { ok: false, error: "You don't belong to an organization yet." };

  const existing = await prisma.watchlist.findUnique({ where: { id: watchlistId } });
  if (!existing || existing.organizationId !== membership.organizationId) {
    return { ok: false, error: "Watchlist not found." };
  }

  await prisma.watchlist.delete({ where: { id: watchlistId } });
  revalidatePath("/dashboard/watchlists");
  return { ok: true };
}

export async function addCompanyToWatchlist(watchlistId: string, companyId: string): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const membership = await resolveActiveMembership(userId);
  if (!membership) return { ok: false, error: "You don't belong to an organization yet." };

  const [watchlist, company] = await Promise.all([
    prisma.watchlist.findUnique({ where: { id: watchlistId } }),
    prisma.company.findUnique({ where: { id: companyId } }),
  ]);
  if (!watchlist || watchlist.organizationId !== membership.organizationId) return { ok: false, error: "Watchlist not found." };
  if (!company || company.organizationId !== membership.organizationId) return { ok: false, error: "Company not found." };

  try {
    await prisma.watchlistCompany.upsert({
      where: { watchlistId_companyId: { watchlistId, companyId } },
      create: { watchlistId, companyId, addedByUserId: userId },
      update: {},
    });
    revalidatePath("/dashboard/watchlists");
    revalidatePath(`/dashboard/watchlists/${watchlistId}`);
    revalidatePath("/dashboard/companies");
    revalidatePath(`/dashboard/companies/${companyId}`);
    return { ok: true };
  } catch (error) {
    console.error("[watchlists] addCompanyToWatchlist failed:", error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

export async function removeCompanyFromWatchlist(watchlistId: string, companyId: string): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const membership = await resolveActiveMembership(userId);
  if (!membership) return { ok: false, error: "You don't belong to an organization yet." };

  const watchlist = await prisma.watchlist.findUnique({ where: { id: watchlistId } });
  if (!watchlist || watchlist.organizationId !== membership.organizationId) return { ok: false, error: "Watchlist not found." };

  await prisma.watchlistCompany.deleteMany({ where: { watchlistId, companyId } });
  revalidatePath("/dashboard/watchlists");
  revalidatePath(`/dashboard/watchlists/${watchlistId}`);
  revalidatePath("/dashboard/companies");
  revalidatePath(`/dashboard/companies/${companyId}`);
  return { ok: true };
}
