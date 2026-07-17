import Link from "next/link";
import { Store, MessagesSquare, Calendar, CreditCard, Zap, Mail, LayoutTemplate, Scale, Package, Star, Search, Briefcase } from "lucide-react";

import { Container } from "@/components/ui/container";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/prisma";
import { ensureMarketplaceCatalog } from "@/lib/marketplace";
import { ensureAllPhase19MarketplaceListings } from "@/lib/marketplace/seed";
import { isFeatureEnabled } from "@/lib/billing/feature-flags";
import { requireActiveMembership } from "../_lib/require-membership";
import { InterestButton } from "./_components/interest-button";
import { RecommendedForYou } from "./_components/recommended-for-you";
import type { MarketplaceCategory, Prisma } from "@/generated/prisma/client";

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

const CATEGORY_LABELS: Record<string, string> = {
  INTEGRATION: "Legacy Integration",
  TEMPLATE: "Legacy Template",
  AGENT_PACK: "AI Agents",
  WORKFLOW: "Workflows",
  CRM_TEMPLATE: "CRM Templates",
  PROPOSAL_TEMPLATE: "Proposal Templates",
  AUTOMATION_TEMPLATE: "Automation Templates",
  INDUSTRY_PACK: "Industry Packs",
  DASHBOARD_PACK: "Dashboard Packs",
  ANALYTICS_PACK: "Analytics Packs",
  INTEGRATION_CONNECTOR: "Integrations",
  WHITE_LABEL_PACK: "White Label Packs",
  PROMPT_PACK: "Prompt Packs",
  KNOWLEDGE_PACK: "Knowledge Packs",
};

const SORT_OPTIONS = [
  { value: "installs", label: "Most Installed" },
  { value: "rating", label: "Highest Rated" },
  { value: "new", label: "Recently Updated" },
  { value: "name", label: "Name (A-Z)" },
];

export default async function MarketplacePage({ searchParams }: { searchParams: Promise<{ q?: string; category?: string; sort?: string }> }) {
  const { membership } = await requireActiveMembership("/dashboard/marketplace");
  const organizationId = membership.organizationId;
  const params = await searchParams;

  const marketplaceEnabled = await isFeatureEnabled(organizationId, "marketplace");
  if (!marketplaceEnabled) {
    return (
      <main className="py-8">
        <Container>
          <Card glass>
            <CardContent className="flex flex-col items-center gap-3 p-12 text-center">
              <Store className="size-8 text-muted-foreground" strokeWidth={1.5} />
              <p className="text-sm text-muted-foreground">The Marketplace has been disabled for this organization by an owner/admin.</p>
            </CardContent>
          </Card>
        </Container>
      </main>
    );
  }

  await ensureMarketplaceCatalog();
  await ensureAllPhase19MarketplaceListings();

  const searchTerm = params.q?.trim();
  const category = params.category;
  const sort = params.sort ?? "installs";

  const where: Prisma.MarketplaceListingWhereInput = {
    status: { in: ["AVAILABLE", "PUBLISHED"] },
    ...(category ? { category: category as MarketplaceCategory } : {}),
    ...(searchTerm
      ? {
          OR: [
            { name: { contains: searchTerm, mode: "insensitive" } },
            { description: { contains: searchTerm, mode: "insensitive" } },
            { tagline: { contains: searchTerm, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const orderBy: Prisma.MarketplaceListingOrderByWithRelationInput =
    sort === "rating" ? { ratingAverage: "desc" } : sort === "new" ? { updatedAt: "desc" } : sort === "name" ? { name: "asc" } : { installCount: "desc" };

  const [listings, categoryCounts, interests, installs] = await Promise.all([
    prisma.marketplaceListing.findMany({ where, orderBy, take: 60 }),
    prisma.marketplaceListing.groupBy({ by: ["category"], where: { status: { in: ["AVAILABLE", "PUBLISHED"] } }, _count: { _all: true } }),
    prisma.marketplaceInterest.findMany({ where: { organizationId }, select: { listingId: true } }),
    prisma.marketplaceInstall.findMany({ where: { organizationId, status: "ACTIVE" }, select: { listingId: true } }),
  ]);
  const interestedIds = new Set(interests.map((i) => i.listingId));
  const installedIds = new Set(installs.map((i) => i.listingId));

  return (
    <main className="py-8">
      <Container className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Marketplace</h1>
            <p className="text-sm text-muted-foreground">
              AI Agents, Workflows, Industry Packs, Templates, and more — real, one-click installable, backed by a
              real manifest. Nothing here is a fabricated listing.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href="/dashboard/marketplace/installed">
                <Package className="size-4" /> Installed
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href="/dashboard/marketplace/publisher">
                <Briefcase className="size-4" /> Publisher Portal
              </Link>
            </Button>
          </div>
        </div>

        <RecommendedForYou organizationId={organizationId} />

        <form className="flex flex-wrap items-center gap-2" action="/dashboard/marketplace">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input name="q" defaultValue={searchTerm} placeholder="Search the marketplace..." className="pl-9" />
          </div>
          <Select name="category" defaultValue={category ?? ""} className="w-48">
            <option value="">All categories</option>
            {categoryCounts.map((c) => (
              <option key={c.category} value={c.category}>
                {CATEGORY_LABELS[c.category] ?? c.category} ({c._count._all})
              </option>
            ))}
          </Select>
          <Select name="sort" defaultValue={sort} className="w-44">
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
          <Button type="submit" size="sm">
            Filter
          </Button>
        </form>

        {listings.length === 0 ? (
          <Card glass>
            <CardContent className="flex flex-col items-center gap-3 p-12 text-center">
              <Store className="size-8 text-muted-foreground" strokeWidth={1.5} />
              <p className="text-sm text-muted-foreground">No listings match your filters.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {listings.map((listing) => {
              const Icon = ICONS[listing.icon ?? ""] ?? Store;
              const isLegacyStub = !listing.slug;
              return (
                <Card key={listing.id} glass className={!isLegacyStub ? "transition-colors hover:border-primary/40" : undefined}>
                  <CardContent className="flex flex-col gap-3 p-5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Icon className="size-4" />
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <Badge variant="outline">{CATEGORY_LABELS[listing.category] ?? listing.category}</Badge>
                        {installedIds.has(listing.id) && <Badge variant="accent">Installed</Badge>}
                      </div>
                    </div>
                    {isLegacyStub ? (
                      <>
                        <p className="font-medium text-foreground">{listing.name}</p>
                        <p className="text-sm text-muted-foreground">{listing.description}</p>
                        {listing.status === "COMING_SOON" ? (
                          <div className="mt-1 flex items-center justify-between">
                            <span className="text-xs text-muted-foreground">
                              {listing.interestCount} team{listing.interestCount === 1 ? "" : "s"} interested
                            </span>
                            <InterestButton listingId={listing.id} alreadyInterested={interestedIds.has(listing.id)} />
                          </div>
                        ) : (
                          <a href="/profile" className="text-xs text-primary hover:underline">
                            Configure in Profile → Notifications
                          </a>
                        )}
                      </>
                    ) : (
                      <Link href={`/dashboard/marketplace/${listing.slug}`} className="flex flex-col gap-2">
                        <p className="font-medium text-foreground">{listing.name}</p>
                        <p className="line-clamp-2 text-sm text-muted-foreground">{listing.tagline || listing.description}</p>
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>
                            {listing.pricingModel === "FREE" ? "Free" : `${(listing.priceCents ?? 0) / 100} ${listing.currency ?? ""}`}
                          </span>
                          <div className="flex items-center gap-3">
                            {listing.ratingCount > 0 && (
                              <span className="flex items-center gap-1">
                                <Star className="size-3 fill-amber-400 text-amber-400" /> {listing.ratingAverage.toFixed(1)}
                              </span>
                            )}
                            <span>{listing.installCount} installs</span>
                          </div>
                        </div>
                      </Link>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </Container>
    </main>
  );
}
