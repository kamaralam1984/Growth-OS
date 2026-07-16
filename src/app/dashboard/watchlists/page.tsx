import Link from "next/link";
import { Bookmark, Building2 } from "lucide-react";

import { Container } from "@/components/ui/container";
import { Card, CardContent } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import { requireActiveMembership } from "../_lib/require-membership";
import { WatchlistForm } from "./_components/watchlist-form";

export default async function WatchlistsPage() {
  const { membership } = await requireActiveMembership("/dashboard/watchlists");

  const watchlists = await prisma.watchlist.findMany({
    where: { organizationId: membership.organizationId },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { companies: true } } },
  });

  return (
    <main className="py-8">
      <Container className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Watchlists</h1>
            <p className="text-sm text-muted-foreground">
              Group companies you&apos;re tracking closely — add companies from Companies or a Company Profile.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard/companies"
              className="flex items-center gap-1.5 text-sm text-primary hover:underline"
            >
              <Building2 className="size-4" /> View Companies
            </Link>
            <WatchlistForm />
          </div>
        </div>

        {watchlists.length === 0 ? (
          <Card glass>
            <CardContent className="flex flex-col items-center gap-3 p-12 text-center">
              <Bookmark className="size-8 text-muted-foreground" strokeWidth={1.5} />
              <p className="text-sm text-muted-foreground">
                No watchlists yet. Create one, then add companies to it from Companies or a Company Profile.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {watchlists.map((watchlist) => (
              <Link key={watchlist.id} href={`/dashboard/watchlists/${watchlist.id}`}>
                <Card glass className="h-full transition-transform duration-150 hover:-translate-y-0.5">
                  <CardContent className="flex flex-col gap-2 p-5">
                    <div className="flex items-center gap-2">
                      <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Bookmark className="size-4" />
                      </div>
                      <p className="font-medium text-foreground">{watchlist.name}</p>
                    </div>
                    {watchlist.description && <p className="text-xs text-muted-foreground">{watchlist.description}</p>}
                    <p className="mt-1 text-xs text-muted-foreground">{watchlist._count.companies} companies</p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </Container>
    </main>
  );
}
