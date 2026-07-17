import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Container } from "@/components/ui/container";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ApplyPublisherForm } from "./_components/apply-publisher-form";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "accent"> = {
  PENDING: "secondary",
  APPROVED: "accent",
  SUSPENDED: "outline",
  REJECTED: "outline",
};

export default async function PublisherPortalPage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    redirect("/login?callbackUrl=%2Fdashboard%2Fmarketplace%2Fpublisher");
  }

  const publisher = await prisma.marketplacePublisher.findUnique({
    where: { userId },
    include: { listings: { orderBy: { createdAt: "desc" } }, partner: { select: { referralCode: true, status: true } } },
  });

  return (
    <main className="py-8">
      <Container className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Publisher Portal</h1>
          <p className="text-sm text-muted-foreground">
            Publish AI Agents, Workflows, Industry Packs, Prompt Packs, Knowledge Packs, and more to the Marketplace.
            Your earnings flow through the same real commission/payout system as the Partner referral program.
          </p>
        </div>

        {!publisher ? (
          <ApplyPublisherForm />
        ) : (
          <>
            <Card glass className="max-w-xl">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {publisher.displayName}
                  <Badge variant={STATUS_VARIANT[publisher.status]}>{publisher.status}</Badge>
                </CardTitle>
                <CardDescription>
                  {publisher.status === "PENDING"
                    ? "A platform operator reviews and approves new publisher applications manually — there's no self-service approval."
                    : publisher.status === "APPROVED"
                      ? "Approved — your submitted listings can go through review and publish."
                      : "Your publisher account is not currently active."}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 text-sm text-muted-foreground">
                <p>Contact: {publisher.contactEmail}</p>
                {publisher.companyName && <p>Company: {publisher.companyName}</p>}
                {publisher.website && <p>Website: {publisher.website}</p>}
                {publisher.partner && <p>Referral/payout code: {publisher.partner.referralCode} ({publisher.partner.status})</p>}
              </CardContent>
            </Card>

            <Card glass>
              <CardHeader>
                <CardTitle className="text-base">Your listings</CardTitle>
                <CardDescription>{publisher.listings.length} total</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {publisher.listings.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No listings submitted yet.</p>
                ) : (
                  publisher.listings.map((listing) => (
                    <div key={listing.id} className="flex items-center justify-between text-sm">
                      <span className="text-foreground">{listing.name}</span>
                      <Badge variant="outline">{listing.status}</Badge>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </>
        )}
      </Container>
    </main>
  );
}
