import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Star, Package, Clock, ShieldCheck } from "lucide-react";

import { Container } from "@/components/ui/container";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/prisma";
import { formatRelativeTime } from "@/lib/utils";
import { formatCurrency } from "@/app/dashboard/_lib/format";
import { requireActiveMembership } from "@/app/dashboard/_lib/require-membership";
import { InstallButton } from "./_components/install-button";
import { ReviewForm } from "./_components/review-form";

export default async function MarketplaceListingDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { membership } = await requireActiveMembership(`/dashboard/marketplace/${slug}`);
  const organizationId = membership.organizationId;

  const listing = await prisma.marketplaceListing.findUnique({
    where: { slug },
    include: {
      publisher: { select: { displayName: true } },
      currentVersion: { include: { dependencies: { include: { dependsOnListing: { select: { id: true, name: true, slug: true } } } } } },
      versions: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!listing) notFound();

  const [install, reviews, pendingManualOrder] = await Promise.all([
    prisma.marketplaceInstall.findUnique({ where: { organizationId_listingId: { organizationId, listingId: listing.id } } }),
    prisma.marketplaceReview.findMany({ where: { listingId: listing.id }, include: { user: { select: { name: true, email: true } } }, orderBy: { createdAt: "desc" }, take: 20 }),
    prisma.marketplaceOrder.findFirst({ where: { organizationId, listingId: listing.id, status: "PENDING", gatewayProvider: "MANUAL" }, orderBy: { createdAt: "desc" } }),
  ]);

  const installStatus: "NONE" | "ACTIVE" | "FAILED" = install?.status === "ACTIVE" ? "ACTIVE" : install?.status === "FAILED" ? "FAILED" : "NONE";
  const canReview = install?.status === "ACTIVE" && !reviews.some((r) => r.organizationId === organizationId);

  return (
    <main className="py-8">
      <Container className="flex flex-col gap-6">
        <Link href="/dashboard/marketplace" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="size-4" /> Back to Marketplace
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">{listing.name}</h1>
              {listing.isVerified && <ShieldCheck className="size-5 text-primary" />}
            </div>
            {listing.tagline && <p className="text-sm text-muted-foreground">{listing.tagline}</p>}
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="outline">{listing.category.replace(/_/g, " ")}</Badge>
              {listing.publisher ? <span>by {listing.publisher.displayName}</span> : <span>by KVL GrowthOS</span>}
              {listing.ratingCount > 0 && (
                <span className="flex items-center gap-1">
                  <Star className="size-3.5 fill-amber-400 text-amber-400" /> {listing.ratingAverage.toFixed(1)} ({listing.ratingCount})
                </span>
              )}
              <span className="flex items-center gap-1">
                <Package className="size-3.5" /> {listing.installCount} install{listing.installCount === 1 ? "" : "s"}
              </span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <p className="text-xl font-semibold text-foreground">
              {listing.pricingModel === "FREE" ? "Free" : formatCurrency((listing.priceCents ?? 0) / 100, listing.currency ?? "USD")}
              {listing.pricingModel === "SUBSCRIPTION" && <span className="text-sm text-muted-foreground">/{(listing.billingInterval ?? "MONTHLY").toLowerCase()}</span>}
            </p>
            <InstallButton listingId={listing.id} isFree={listing.pricingModel === "FREE"} installStatus={installStatus} pendingManualOrderId={pendingManualOrder?.id ?? null} />
          </div>
        </div>

        {installStatus === "FAILED" && install?.lastError && (
          <Card glass className="border-destructive/30">
            <CardContent className="p-4 text-sm text-destructive">Last install attempt failed: {install.lastError}</CardContent>
          </Card>
        )}

        <Card glass>
          <CardHeader>
            <CardTitle className="text-base">Description</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-foreground">{listing.description}</p>
          </CardContent>
        </Card>

        {listing.currentVersion && listing.currentVersion.dependencies.length > 0 && (
          <Card glass>
            <CardHeader>
              <CardTitle className="text-base">Dependencies</CardTitle>
              <CardDescription>Must be installed first, unless marked optional.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {listing.currentVersion.dependencies.map((dep) => (
                <div key={dep.id} className="flex items-center justify-between text-sm">
                  <Link href={dep.dependsOnListing.slug ? `/dashboard/marketplace/${dep.dependsOnListing.slug}` : "#"} className="text-primary hover:underline">
                    {dep.dependsOnListing.name}
                  </Link>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {dep.minVersion && <span>≥ v{dep.minVersion}</span>}
                    {dep.optional && <Badge variant="outline">Optional</Badge>}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <Card glass>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="size-4" /> Version history
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {listing.versions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No published versions yet.</p>
            ) : (
              listing.versions.map((version) => (
                <div key={version.id} className="flex items-center justify-between text-sm">
                  <span className="text-foreground">
                    v{version.version} {version.id === listing.currentVersionId && <Badge variant="accent">Current</Badge>}
                  </span>
                  <span className="text-xs text-muted-foreground">{version.publishedAt ? formatRelativeTime(version.publishedAt) : version.status}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card glass>
          <CardHeader>
            <CardTitle className="text-base">Reviews</CardTitle>
            <CardDescription>{reviews.length} real review{reviews.length === 1 ? "" : "s"} from organizations with a verified install.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {canReview && <ReviewForm listingId={listing.id} />}
            {reviews.length === 0 ? (
              <p className="text-sm text-muted-foreground">No reviews yet.</p>
            ) : (
              reviews.map((review) => (
                <div key={review.id} className="flex flex-col gap-1 border-b border-border pb-3 last:border-0 last:pb-0">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-0.5">
                        {Array.from({ length: 5 }, (_, i) => (
                          <Star key={i} className={`size-3.5 ${i < review.rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground"}`} />
                        ))}
                      </div>
                      <Badge variant="outline" className="text-[10px]">
                        Verified install
                      </Badge>
                    </div>
                    <span className="text-xs text-muted-foreground">{formatRelativeTime(review.createdAt)}</span>
                  </div>
                  {review.title && <p className="text-sm font-medium text-foreground">{review.title}</p>}
                  {review.body && <p className="text-sm text-muted-foreground">{review.body}</p>}
                  <p className="text-xs text-muted-foreground">— {review.user.name ?? review.user.email}</p>
                  {review.publisherResponse && (
                    <div className="mt-1 rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">Publisher response: </span>
                      {review.publisherResponse}
                    </div>
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </Container>
    </main>
  );
}
