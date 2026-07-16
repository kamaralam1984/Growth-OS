"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { decryptMemory } from "@/lib/ai/encryption";
import type { BookmarkKind, BookmarkableType } from "@/generated/prisma/client";

/**
 * Bookmarks & Favorites — a personal, non-destructive action any active
 * member can take (no OWNER/ADMIN gate), same posture as
 * src/components/command-center/actions.ts's search actions. Identity and
 * organization are always re-derived from the session; targetType/targetId
 * are the only client-supplied values, and every underlying lookup re-scopes
 * by this user's real organizationId — never trusted blindly.
 */

async function requireMembership() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { userId: null as never, organizationId: null, error: "You must be signed in." } as const;

  const membership = await prisma.membership.findFirst({
    where: { userId, status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
  });
  if (!membership) {
    return { userId, organizationId: null, error: "You don't belong to an organization yet." } as const;
  }

  return { userId, organizationId: membership.organizationId, error: null } as const;
}

/** Duck-typed Prisma unique-constraint-violation check — same pattern as src/lib/dashboard.ts. */
function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "P2002";
}

export interface ToggleBookmarkResult {
  ok: boolean;
  bookmarked: boolean;
  error?: string;
}

/**
 * Create-or-delete toggle on Bookmark's real [userId, kind, targetType,
 * targetId] unique constraint. Idempotent from the UI's perspective: a
 * concurrent double-click (or two tabs) either both land on "bookmarked" or
 * both land on "not bookmarked" rather than surfacing a spurious error.
 */
export async function toggleBookmark(
  targetType: BookmarkableType,
  targetId: string,
  kind: BookmarkKind = "BOOKMARK",
): Promise<ToggleBookmarkResult> {
  const { userId, organizationId, error } = await requireMembership();
  if (!organizationId || !userId) return { ok: false, bookmarked: false, error: error ?? "Not authorized." };

  const trimmedTargetId = targetId.trim();
  if (!trimmedTargetId) return { ok: false, bookmarked: false, error: "Missing target." };

  const existing = await prisma.bookmark.findUnique({
    where: { userId_kind_targetType_targetId: { userId, kind, targetType, targetId: trimmedTargetId } },
  });

  if (existing) {
    try {
      await prisma.bookmark.delete({ where: { id: existing.id } });
    } catch {
      // Already gone (a concurrent toggle removed it first) — the end state
      // ("not bookmarked") is what we'd have produced anyway.
    }
    return { ok: true, bookmarked: false };
  }

  try {
    await prisma.bookmark.create({
      data: { organizationId, userId, kind, targetType, targetId: trimmedTargetId },
    });
    return { ok: true, bookmarked: true };
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      // A concurrent toggle already created it — the end state is the same
      // as if this call had won the race.
      return { ok: true, bookmarked: true };
    }
    console.error("[bookmarks] toggle failed:", err);
    return { ok: false, bookmarked: false, error: "Could not update bookmark. Please try again." };
  }
}

export interface BookmarkRow {
  id: string;
  kind: BookmarkKind;
  targetType: BookmarkableType;
  targetId: string;
  createdAt: string;
}

export interface ListBookmarksResult {
  ok: boolean;
  bookmarks: BookmarkRow[];
  error?: string;
}

/** Real Bookmark rows for the signed-in user, optionally filtered to one kind (BOOKMARK vs FAVORITE). */
export async function listBookmarks(kind?: BookmarkKind): Promise<ListBookmarksResult> {
  const { userId, organizationId, error } = await requireMembership();
  if (!organizationId || !userId) return { ok: false, bookmarks: [], error: error ?? "Not authorized." };

  const rows = await prisma.bookmark.findMany({
    where: { organizationId, userId, ...(kind ? { kind } : {}) },
    orderBy: { createdAt: "desc" },
  });

  return {
    ok: true,
    bookmarks: rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      targetType: r.targetType,
      targetId: r.targetId,
      createdAt: r.createdAt.toISOString(),
    })),
  };
}

export interface ResolvedBookmark extends BookmarkRow {
  title: string;
  href: string | null;
  deleted: boolean;
}

/** href convention per targetType — mirrors the hrefs src/lib/search.ts's globalSearch already uses for the same entities. */
function hrefFor(targetType: BookmarkableType, targetId: string): string | null {
  switch (targetType) {
    case "KNOWLEDGE_ARTICLE":
      return `/dashboard/knowledge-base/${targetId}`;
    case "DEAL":
      return `/dashboard/crm/deals/${targetId}`;
    case "PROJECT":
      return `/dashboard/projects/${targetId}`;
    case "COMPANY":
      return `/dashboard/companies/${targetId}`;
    case "CONTACT":
      return `/dashboard/outreach/contacts/${targetId}`;
    case "DOCUMENT":
      return `/dashboard/documents`;
    case "MEETING":
      return `/board/meetings/${targetId}`;
    case "INGESTED_DOCUMENT":
      return `/dashboard/knowledge-base/documents/${targetId}`;
    case "AGENT_MEMORY":
      return `/dashboard/ai-command-center/memory`;
    default:
      return null;
  }
}

/**
 * Resolves each bookmark's real title from its own model, org-scoped, and
 * never throws on a missing/deleted target — it renders "(deleted item)"
 * instead, since a bookmark pointing at a since-deleted row is an honest,
 * expected state, not an error.
 */
export async function resolveBookmarks(bookmarks: BookmarkRow[]): Promise<ResolvedBookmark[]> {
  const idsByType = new Map<BookmarkableType, string[]>();
  for (const b of bookmarks) {
    idsByType.set(b.targetType, [...(idsByType.get(b.targetType) ?? []), b.targetId]);
  }

  const { organizationId } = await requireMembership();
  if (!organizationId) {
    return bookmarks.map((b) => ({ ...b, title: "(deleted item)", href: null, deleted: true }));
  }

  const [articles, deals, projects, companies, contacts, documents, meetings, ingestedDocuments, agentMemories] = await Promise.all([
    idsByType.get("KNOWLEDGE_ARTICLE")?.length
      ? prisma.knowledgeArticle.findMany({
          where: { id: { in: idsByType.get("KNOWLEDGE_ARTICLE") }, knowledgeBase: { workspace: { organizationId } } },
          select: { id: true, title: true },
        })
      : [],
    idsByType.get("DEAL")?.length
      ? prisma.deal.findMany({ where: { id: { in: idsByType.get("DEAL") }, organizationId }, select: { id: true, name: true } })
      : [],
    idsByType.get("PROJECT")?.length
      ? prisma.project.findMany({ where: { id: { in: idsByType.get("PROJECT") }, organizationId }, select: { id: true, name: true } })
      : [],
    idsByType.get("COMPANY")?.length
      ? prisma.company.findMany({ where: { id: { in: idsByType.get("COMPANY") }, organizationId }, select: { id: true, name: true } })
      : [],
    idsByType.get("CONTACT")?.length
      ? prisma.contact.findMany({
          where: { id: { in: idsByType.get("CONTACT") }, organizationId },
          select: { id: true, firstName: true, lastName: true },
        })
      : [],
    idsByType.get("DOCUMENT")?.length
      ? prisma.document.findMany({ where: { id: { in: idsByType.get("DOCUMENT") }, organizationId }, select: { id: true, name: true } })
      : [],
    idsByType.get("MEETING")?.length
      ? prisma.meeting.findMany({ where: { id: { in: idsByType.get("MEETING") }, organizationId }, select: { id: true, title: true } })
      : [],
    idsByType.get("INGESTED_DOCUMENT")?.length
      ? prisma.ingestedDocument.findMany({ where: { id: { in: idsByType.get("INGESTED_DOCUMENT") }, organizationId }, select: { id: true, title: true } })
      : [],
    idsByType.get("AGENT_MEMORY")?.length
      ? prisma.agentMemory.findMany({ where: { id: { in: idsByType.get("AGENT_MEMORY") }, organizationId }, select: { id: true, type: true, encryptedContent: true } })
      : [],
  ]);

  const titleMap = new Map<string, string>();
  for (const a of articles) titleMap.set(`KNOWLEDGE_ARTICLE:${a.id}`, a.title);
  for (const d of deals) titleMap.set(`DEAL:${d.id}`, d.name);
  for (const p of projects) titleMap.set(`PROJECT:${p.id}`, p.name);
  for (const c of companies) titleMap.set(`COMPANY:${c.id}`, c.name);
  for (const c of contacts) titleMap.set(`CONTACT:${c.id}`, `${c.firstName} ${c.lastName ?? ""}`.trim());
  for (const d of documents) titleMap.set(`DOCUMENT:${d.id}`, d.name);
  for (const m of meetings) titleMap.set(`MEETING:${m.id}`, m.title);
  for (const d of ingestedDocuments) titleMap.set(`INGESTED_DOCUMENT:${d.id}`, d.title);
  for (const m of agentMemories) {
    let snippet = "(could not decrypt)";
    try {
      snippet = decryptMemory(m.encryptedContent).trim().replace(/\s+/g, " ").slice(0, 80);
    } catch {
      // leave the fallback snippet
    }
    titleMap.set(`AGENT_MEMORY:${m.id}`, `[${m.type}] ${snippet}`);
  }

  return bookmarks.map((b) => {
    const title = titleMap.get(`${b.targetType}:${b.targetId}`);
    if (title === undefined) {
      return { ...b, title: "(deleted item)", href: null, deleted: true };
    }
    return { ...b, title, href: hrefFor(b.targetType, b.targetId), deleted: false };
  });
}
