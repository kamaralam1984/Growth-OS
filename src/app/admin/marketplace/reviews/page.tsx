import { Container } from "@/components/ui/container";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import { requirePlatformOwner } from "@/lib/billing/platform-admin";
import { ReviewModerationRow } from "./_components/review-moderation-row";

export default async function AdminMarketplaceReviewsPage() {
  await requirePlatformOwner("/admin/marketplace/reviews");

  const reviews = await prisma.marketplaceReview.findMany({
    include: { listing: { select: { name: true } }, user: { select: { name: true, email: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <Container className="flex flex-col gap-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Marketplace Reviews</h1>
        <p className="text-sm text-muted-foreground">Every real review across the platform — {reviews.length} total. Respond as the publisher, or remove abusive/spam content.</p>
      </div>

      <Card glass>
        <CardHeader>
          <CardTitle>Reviews</CardTitle>
          <CardDescription>Most recent first.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {reviews.length === 0 ? (
            <p className="text-sm text-muted-foreground">No reviews yet.</p>
          ) : (
            reviews.map((review) => (
              <ReviewModerationRow
                key={review.id}
                reviewId={review.id}
                listingName={review.listing.name}
                rating={review.rating}
                title={review.title}
                body={review.body}
                authorLabel={review.user.name ?? review.user.email ?? "Unknown"}
                existingResponse={review.publisherResponse}
              />
            ))
          )}
        </CardContent>
      </Card>
    </Container>
  );
}
