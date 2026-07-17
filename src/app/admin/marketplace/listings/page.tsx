import { Container } from "@/components/ui/container";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { prisma } from "@/lib/prisma";
import { requirePlatformOwner } from "@/lib/billing/platform-admin";
import { ListingReviewActions } from "./_components/listing-review-actions";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "accent"> = {
  DRAFT: "secondary",
  IN_REVIEW: "accent",
  PUBLISHED: "default",
  AVAILABLE: "default",
  COMING_SOON: "secondary",
  REJECTED: "outline",
  DEPRECATED: "outline",
  SUSPENDED: "outline",
};

export default async function AdminMarketplaceListingsPage() {
  await requirePlatformOwner("/admin/marketplace/listings");

  const listings = await prisma.marketplaceListing.findMany({
    include: {
      publisher: { select: { displayName: true } },
      versions: { where: { status: "DRAFT" }, orderBy: { createdAt: "desc" }, take: 1 },
      _count: { select: { installs: true, reviews: true } },
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });

  const inReview = listings.filter((l) => l.status === "IN_REVIEW");
  const rest = listings.filter((l) => l.status !== "IN_REVIEW");

  return (
    <Container className="flex flex-col gap-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Marketplace Listings</h1>
        <p className="text-sm text-muted-foreground">Every real listing across the platform — {listings.length} total, {inReview.length} awaiting review.</p>
      </div>

      {inReview.length > 0 && (
        <Card glass className="border-primary/30">
          <CardHeader>
            <CardTitle>Awaiting review</CardTitle>
            <CardDescription>Publisher-submitted listings with a real draft version ready to approve or reject.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {inReview.map((listing) => (
              <div key={listing.id} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
                <div>
                  <p className="font-medium text-foreground">{listing.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {listing.category.replace(/_/g, " ")} · by {listing.publisher?.displayName ?? "Unknown"}
                  </p>
                </div>
                <ListingReviewActions listingId={listing.id} draftVersionId={listing.versions[0]?.id ?? null} status={listing.status} />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card glass>
        <CardHeader>
          <CardTitle>All listings</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Publisher</TableHead>
                <TableHead>Installs</TableHead>
                <TableHead>Reviews</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rest.map((listing) => (
                <TableRow key={listing.id}>
                  <TableCell>{listing.name}</TableCell>
                  <TableCell>{listing.category.replace(/_/g, " ")}</TableCell>
                  <TableCell>{listing.publisher?.displayName ?? "KVL GrowthOS"}</TableCell>
                  <TableCell>{listing._count.installs}</TableCell>
                  <TableCell>{listing._count.reviews}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[listing.status]}>{listing.status}</Badge>
                  </TableCell>
                  <TableCell>
                    <ListingReviewActions listingId={listing.id} draftVersionId={null} status={listing.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </Container>
  );
}
