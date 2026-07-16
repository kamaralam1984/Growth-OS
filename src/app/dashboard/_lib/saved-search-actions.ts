"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { notifyUser } from "@/lib/notifications";
import type { DiscoveryFilters } from "@/lib/validations/discovery";
import { searchLeads } from "@/app/dashboard/lead-finder/actions";
import { searchClients } from "@/app/dashboard/client-finder/actions";
import type { DiscoveredCompany } from "@/lib/ai/agent-runtime";

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

export interface SavedSearchView {
  id: string;
  name: string;
  kind: "lead" | "client";
  query: string;
  filters: Partial<DiscoveryFilters>;
  notifyOnMatch: boolean;
  lastRunAt: string | null;
  lastResultCount: number | null;
  createdAt: string;
}

interface StoredFilters {
  kind: "lead" | "client";
  query: string;
  filters: Partial<DiscoveryFilters>;
}

function toView(row: {
  id: string;
  name: string;
  filters: unknown;
  notifyOnMatch: boolean;
  lastRunAt: Date | null;
  lastResultCount: number | null;
  createdAt: Date;
}): SavedSearchView {
  const stored = row.filters as unknown as StoredFilters;
  return {
    id: row.id,
    name: row.name,
    kind: stored.kind,
    query: stored.query,
    filters: stored.filters ?? {},
    notifyOnMatch: row.notifyOnMatch,
    lastRunAt: row.lastRunAt ? row.lastRunAt.toISOString() : null,
    lastResultCount: row.lastResultCount,
    createdAt: row.createdAt.toISOString(),
  };
}

export interface SaveSearchResult extends ActionResult {
  savedSearchId?: string;
}

export async function saveSearch(
  name: string,
  kind: "lead" | "client",
  query: string,
  filters: Partial<DiscoveryFilters>,
): Promise<SaveSearchResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };
  if (!name.trim() || !query.trim()) return { ok: false, error: "Give the search a name and a query." };

  const membership = await resolveActiveMembership(userId);
  if (!membership) return { ok: false, error: "You don't belong to an organization yet." };

  try {
    const saved = await prisma.savedSearch.create({
      data: {
        organizationId: membership.organizationId,
        userId,
        name: name.trim(),
        filters: { kind, query, filters } satisfies StoredFilters,
      },
    });
    await logAudit({
      userId,
      organizationId: membership.organizationId,
      action: "lead_finder.search_saved",
      metadata: { savedSearchId: saved.id, kind },
    });
    revalidatePath("/dashboard/lead-finder");
    revalidatePath("/dashboard/client-finder");
    return { ok: true, savedSearchId: saved.id };
  } catch (error) {
    console.error("[saved-search] saveSearch failed:", error);
    return { ok: false, error: "Something went wrong saving this search. Please try again." };
  }
}

export async function listSavedSearches(kind?: "lead" | "client"): Promise<SavedSearchView[]> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return [];

  const membership = await resolveActiveMembership(userId);
  if (!membership) return [];

  const rows = await prisma.savedSearch.findMany({
    where: { organizationId: membership.organizationId, userId },
    orderBy: { createdAt: "desc" },
  });
  const views = rows.map(toView);
  return kind ? views.filter((v) => v.kind === kind) : views;
}

export async function deleteSavedSearch(id: string): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  try {
    const existing = await prisma.savedSearch.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId) return { ok: false, error: "Saved search not found." };
    await prisma.savedSearch.delete({ where: { id } });
    revalidatePath("/dashboard/lead-finder");
    revalidatePath("/dashboard/client-finder");
    return { ok: true };
  } catch (error) {
    console.error("[saved-search] deleteSavedSearch failed:", error);
    return { ok: false, error: "Something went wrong deleting this search. Please try again." };
  }
}

export async function toggleSavedSearchNotify(id: string, notifyOnMatch: boolean): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const existing = await prisma.savedSearch.findUnique({ where: { id } });
  if (!existing || existing.userId !== userId) return { ok: false, error: "Saved search not found." };

  await prisma.savedSearch.update({ where: { id }, data: { notifyOnMatch } });
  revalidatePath("/dashboard/lead-finder");
  revalidatePath("/dashboard/client-finder");
  return { ok: true };
}

export interface RunSavedSearchResult extends ActionResult {
  companies?: DiscoveredCompany[];
  errorKind?: "not_connected" | "billing" | "generic";
}

/**
 * Re-runs a saved search's real web search (via the same searchLeads/
 * searchClients actions the Lead/Client Finder pages use), then updates
 * lastRunAt/lastResultCount and — if notifyOnMatch is on and the result
 * count genuinely grew since last time — sends a real notification. No
 * cron: this only ever runs when a user visits and triggers it, or when
 * checkSavedSearchForMatches is called on page load.
 */
export async function runSavedSearch(id: string): Promise<RunSavedSearchResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const saved = await prisma.savedSearch.findUnique({ where: { id } });
  if (!saved || saved.userId !== userId) return { ok: false, error: "Saved search not found." };

  const stored = saved.filters as unknown as StoredFilters;
  const result =
    stored.kind === "lead" ? await searchLeads(stored.query, stored.filters) : await searchClients(stored.query, stored.filters);
  if (!result.ok) return result;

  const newCount = result.companies?.length ?? 0;
  const previousCount = saved.lastResultCount;

  await prisma.savedSearch.update({
    where: { id },
    data: { lastRunAt: new Date(), lastResultCount: newCount },
  });

  if (saved.notifyOnMatch && previousCount != null && newCount > previousCount) {
    const membership = await resolveActiveMembership(userId);
    if (membership) {
      await notifyUser({
        userId,
        organizationId: membership.organizationId,
        type: "NEW_RECOMMENDATION",
        title: `New matches for "${saved.name}"`,
        message: `${newCount - previousCount} more companies now match this saved search.`,
      });
    }
  }

  return { ok: true, companies: result.companies };
}

export interface RecentSearchView {
  id: string;
  kind: "lead" | "client";
  query: string;
  createdAt: string;
}

/** Real search history — derived from the Activity log every search already writes to, no separate model. */
export async function listRecentSearches(kind: "lead" | "client"): Promise<RecentSearchView[]> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return [];

  const membership = await resolveActiveMembership(userId);
  if (!membership) return [];

  const activities = await prisma.activity.findMany({
    where: {
      organizationId: membership.organizationId,
      actorUserId: userId,
      type: "SYSTEM_EVENT",
      metadata: { path: ["searchKind"], equals: kind },
    },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  return activities.map((a) => {
    const metadata = a.metadata as { query?: string } | null;
    return {
      id: a.id,
      kind,
      query: metadata?.query ?? "",
      createdAt: a.createdAt.toISOString(),
    };
  });
}

/**
 * Light, no-AI-call heuristic: suggests searches built from the org's own
 * onboarding profile (services/clientTypes it actually sells + countries it
 * actually serves) that haven't been searched this calendar month yet, per
 * the real Activity-based search history above. Never invents an industry or
 * country the org didn't already tell us about.
 */
export async function listSuggestedSearches(kind: "lead" | "client"): Promise<string[]> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return [];

  const membership = await resolveActiveMembership(userId);
  if (!membership) return [];

  const [org, monthStart] = [
    await prisma.organization.findUnique({
      where: { id: membership.organizationId },
      select: { services: true, clientTypes: true, countriesServed: true },
    }),
    new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  ];
  if (!org) return [];

  const searchedThisMonth = await prisma.activity.findMany({
    where: {
      organizationId: membership.organizationId,
      actorUserId: userId,
      type: "SYSTEM_EVENT",
      metadata: { path: ["searchKind"], equals: kind },
      createdAt: { gte: monthStart },
    },
    select: { metadata: true },
  });
  const searchedQueries = new Set(
    searchedThisMonth.map((a) => ((a.metadata as { query?: string } | null)?.query ?? "").toLowerCase()),
  );

  const targets = kind === "lead" ? org.services : org.clientTypes;
  const candidates: string[] = [];
  for (const target of targets) {
    for (const country of org.countriesServed.length > 0 ? org.countriesServed : [null]) {
      const query = country ? `${target} companies in ${country}` : `${target} companies`;
      if (!searchedQueries.has(query.toLowerCase())) candidates.push(query);
      if (candidates.length >= 4) return candidates;
    }
  }
  return candidates;
}
