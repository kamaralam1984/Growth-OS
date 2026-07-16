import { Store, MessagesSquare, Calendar, CreditCard, Zap, Mail, LayoutTemplate, Scale, Package } from "lucide-react";

import { Container } from "@/components/ui/container";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/prisma";
import { ensureMarketplaceCatalog } from "@/lib/marketplace";
import { requireActiveMembership } from "../_lib/require-membership";
import { InterestButton } from "./_components/interest-button";

const ICONS: Record<string, typeof Store> = {
  slack: MessagesSquare,
  teams: Package,
  calendar: Calendar,
  "credit-card": CreditCard,
  zap: Zap,
  mail: Mail,
  "layout-template": LayoutTemplate,
  scale: Scale,
};

export default async function MarketplacePage() {
  const { membership } = await requireActiveMembership("/dashboard/marketplace");

  await ensureMarketplaceCatalog();

  const [listings, interests] = await Promise.all([
    prisma.marketplaceListing.findMany({ orderBy: [{ status: "asc" }, { name: "asc" }] }),
    prisma.marketplaceInterest.findMany({
      where: { organizationId: membership.organizationId },
      select: { listingId: true },
    }),
  ]);
  const interestedIds = new Set(interests.map((i) => i.listingId));

  return (
    <main className="py-8">
      <Container className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Marketplace</h1>
          <p className="text-sm text-muted-foreground">
            Real integrations and add-ons — Slack and Teams notifications are live today; everything else is
            honestly labeled &ldquo;coming soon,&rdquo; with a real request tracked when you ask to be notified.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {listings.map((listing) => {
            const Icon = ICONS[listing.icon ?? ""] ?? Store;
            return (
              <Card key={listing.id} glass>
                <CardContent className="flex flex-col gap-3 p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon className="size-4" />
                    </div>
                    <Badge variant={listing.status === "AVAILABLE" ? "default" : "outline"}>
                      {listing.status === "AVAILABLE" ? "Available" : "Coming soon"}
                    </Badge>
                  </div>
                  <p className="font-medium text-foreground">{listing.name}</p>
                  <p className="text-sm text-muted-foreground">{listing.description}</p>
                  {listing.status === "COMING_SOON" && (
                    <div className="mt-1 flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">
                        {listing.interestCount} team{listing.interestCount === 1 ? "" : "s"} interested
                      </span>
                      <InterestButton listingId={listing.id} alreadyInterested={interestedIds.has(listing.id)} />
                    </div>
                  )}
                  {listing.status === "AVAILABLE" && (
                    <a href="/profile" className="text-xs text-primary hover:underline">
                      Configure in Profile → Notifications
                    </a>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </Container>
    </main>
  );
}
