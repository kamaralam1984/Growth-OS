import Link from "next/link";
import { Search as SearchIcon, Bookmark as BookmarkIcon } from "lucide-react";

import { Container } from "@/components/ui/container";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { BookmarkButton } from "@/components/bookmark-button";
import { prisma } from "@/lib/prisma";
import { listBookmarks, resolveBookmarks } from "@/lib/bookmarks";
import { requireActiveMembership } from "../_lib/require-membership";
import { SearchPanel, type AuthorOption, type RecentSearchEntry } from "./_components/search-panel";

/**
 * Enterprise Search — a real semantic/keyword search experience over this
 * org's Knowledge Base articles, ingested documents, and AI memory, plus an
 * honest Ask AI mode and real Bookmarks. Distinct from the Cmd+K quick-nav
 * palette (command-center/*), which is unchanged.
 */
export default async function EnterpriseSearchPage() {
  const { userId, membership } = await requireActiveMembership("/dashboard/search");
  const organizationId = membership.organizationId;

  const [recentSearchRows, authorMemberships, bookmarksResult] = await Promise.all([
    prisma.searchHistory.findMany({
      where: { organizationId, userId },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    prisma.membership.findMany({
      where: { organizationId, status: "ACTIVE" },
      select: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "asc" },
    }),
    listBookmarks("BOOKMARK"),
  ]);

  const authors: AuthorOption[] = authorMemberships.map((m) => ({
    id: m.user.id,
    label: m.user.name ?? m.user.email ?? m.user.id,
  }));

  const recentSearches: RecentSearchEntry[] = recentSearchRows.map((s) => ({
    id: s.id,
    query: s.query,
    resultCount: s.resultCount,
    isSemanticSearch: s.isSemanticSearch,
    createdAt: s.createdAt.toISOString(),
  }));

  const resolvedBookmarks = bookmarksResult.ok ? await resolveBookmarks(bookmarksResult.bookmarks) : [];

  return (
    <main className="py-8">
      <Container className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Enterprise Search</h1>
          <p className="text-sm text-muted-foreground">
            Real hybrid semantic/keyword search across this organization&apos;s Knowledge Base, ingested documents,
            and AI memory — with an honest Ask AI mode that only answers from verified sources.
          </p>
        </div>

        <Tabs defaultValue="search">
          <TabsList>
            <TabsTrigger value="search" className="inline-flex items-center gap-1.5">
              <SearchIcon className="size-4" /> Search
            </TabsTrigger>
            <TabsTrigger value="bookmarks" className="inline-flex items-center gap-1.5">
              <BookmarkIcon className="size-4" /> Bookmarks
            </TabsTrigger>
          </TabsList>

          <TabsContent value="search">
            <SearchPanel authors={authors} recentSearches={recentSearches} />
          </TabsContent>

          <TabsContent value="bookmarks">
            <Card glass>
              <CardHeader>
                <CardTitle>Bookmarked items</CardTitle>
                <CardDescription>
                  Real items you&apos;ve bookmarked — resolved live from each item&apos;s own model. Deleted targets show
                  as &ldquo;(deleted item)&rdquo; rather than breaking the page.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {resolvedBookmarks.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No bookmarks yet — bookmark a Knowledge Article from the Search tab.</p>
                ) : (
                  resolvedBookmarks.map((b) => (
                    <div
                      key={b.id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-border px-3.5 py-2.5"
                    >
                      <div className="min-w-0 flex-1">
                        {b.deleted || !b.href ? (
                          <span className="block truncate text-sm text-muted-foreground">{b.title}</span>
                        ) : (
                          <Link href={b.href} className="block truncate text-sm font-medium text-foreground hover:text-primary">
                            {b.title}
                          </Link>
                        )}
                        <span className="text-xs text-muted-foreground">{b.targetType.replace(/_/g, " ")}</span>
                      </div>
                      <BookmarkButton targetType={b.targetType} targetId={b.targetId} kind={b.kind} initialBookmarked size="sm" />
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </Container>
    </main>
  );
}
