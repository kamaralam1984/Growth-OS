import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Container } from "@/components/ui/container";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ApplyPublisherForm } from "./_components/apply-publisher-form";
import { PublisherProfileForm } from "./_components/publisher-profile-form";

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
            <PublisherProfileForm
              status={publisher.status}
              initial={{
                displayName: publisher.displayName,
                companyName: publisher.companyName ?? "",
                website: publisher.website ?? "",
                bio: publisher.bio ?? "",
                logoUrl: publisher.logoStorageKey ? `/api/marketplace/publisher/${userId}/logo` : "",
              }}
              referralInfo={
                publisher.partner ? `Referral/payout code: ${publisher.partner.referralCode} (${publisher.partner.status})` : null
              }
            />

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
