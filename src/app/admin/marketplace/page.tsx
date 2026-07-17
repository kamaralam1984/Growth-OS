import Link from "next/link";
import { Store, Users, Star, Receipt, ArrowRight } from "lucide-react";

import { Container } from "@/components/ui/container";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import { requirePlatformOwner } from "@/lib/billing/platform-admin";

export default async function AdminMarketplacePage() {
  await requirePlatformOwner("/admin/marketplace");

  const [listingCount, inReviewCount, publisherCount, pendingPublisherCount, reviewCount, orderCount, paidOrderStats] = await Promise.all([
    prisma.marketplaceListing.count(),
    prisma.marketplaceListing.count({ where: { status: "IN_REVIEW" } }),
    prisma.marketplacePublisher.count(),
    prisma.marketplacePublisher.count({ where: { status: "PENDING" } }),
    prisma.marketplaceReview.count(),
    prisma.marketplaceOrder.count(),
    prisma.marketplaceOrder.aggregate({ where: { status: "PAID" }, _sum: { amountCents: true }, _count: { _all: true } }),
  ]);

  const cards = [
    { href: "/admin/marketplace/listings", label: "Listings", icon: Store, value: listingCount, sublabel: inReviewCount > 0 ? `${inReviewCount} awaiting review` : "All reviewed" },
    { href: "/admin/marketplace/publishers", label: "Publishers", icon: Users, value: publisherCount, sublabel: pendingPublisherCount > 0 ? `${pendingPublisherCount} pending` : "All reviewed" },
    { href: "/admin/marketplace/reviews", label: "Reviews", icon: Star, value: reviewCount, sublabel: "Real submitted reviews" },
    {
      href: "/admin/marketplace/orders",
      label: "Orders",
      icon: Receipt,
      value: orderCount,
      sublabel: `${((paidOrderStats._sum.amountCents ?? 0) / 100).toFixed(2)} total across ${paidOrderStats._count._all} paid orders`,
    },
  ];

  return (
    <Container className="flex flex-col gap-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Marketplace</h1>
        <p className="text-sm text-muted-foreground">Real platform-wide marketplace curation — listings, publishers, reviews, and orders.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <Link key={card.href} href={card.href}>
            <Card glass className="h-full transition-colors hover:border-primary/40">
              <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
                <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <card.icon className="size-4" /> {card.label}
                </CardTitle>
                <ArrowRight className="size-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold text-foreground">{card.value}</p>
                <p className="text-xs text-muted-foreground">{card.sublabel}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </Container>
  );
}
