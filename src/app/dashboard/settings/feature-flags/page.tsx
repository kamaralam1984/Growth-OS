import { Flag, ShieldCheck } from "lucide-react";

import { Container } from "@/components/ui/container";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { prisma } from "@/lib/prisma";
import { ensureCoreFeatureFlagsSeeded, listOrganizationFeatures } from "@/lib/billing/feature-flags";
import { isPlatformOwner } from "@/lib/billing/platform-admin";
import { requireActiveMembership } from "../../_lib/require-membership";
import { OrgFeaturesTable } from "./_components/org-features-table";
import { GlobalFlagsManager } from "./_components/global-flags-manager";
import { OrgOverrideManager } from "./_components/org-override-manager";

export default async function FeatureFlagsPage() {
  const { userId, membership } = await requireActiveMembership("/dashboard/settings/feature-flags");

  // Lazily seeds the real, core FeatureFlag rows on first page load — same
  // idempotent-upsert idiom as ensureMarketplaceCatalog/ensureAutomationTemplatesSeeded.
  await ensureCoreFeatureFlagsSeeded();

  const [features, isOperator] = await Promise.all([
    listOrganizationFeatures(membership.organizationId),
    isPlatformOwner(userId),
  ]);

  const globalFlags = isOperator
    ? await prisma.featureFlag.findMany({ orderBy: { key: "asc" } })
    : [];

  return (
    <main className="py-8">
      <Container className="flex flex-col gap-6">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-foreground">
            <Flag className="size-5" /> Feature Flags
          </h1>
          <p className="text-sm text-muted-foreground">
            Real feature-flag resolution for this organization — override, then plan, then default, in that order.
          </p>
        </div>

        {isOperator ? (
          <Tabs defaultValue="org">
            <TabsList>
              <TabsTrigger value="org">This organization</TabsTrigger>
              <TabsTrigger value="platform">
                <ShieldCheck className="size-3.5" /> Platform admin
              </TabsTrigger>
            </TabsList>

            <TabsContent value="org">
              <Card glass>
                <CardHeader>
                  <CardTitle className="text-base">Your organization&rsquo;s features</CardTitle>
                  <CardDescription>Read-only — an organization cannot grant itself a feature its plan doesn&rsquo;t include.</CardDescription>
                </CardHeader>
                <CardContent>
                  <OrgFeaturesTable features={features} />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="platform">
              <div className="flex flex-col gap-6">
                <Card glass>
                  <CardContent className="pt-6">
                    <GlobalFlagsManager flags={globalFlags} />
                  </CardContent>
                </Card>
                <Card glass>
                  <CardContent className="pt-6">
                    <OrgOverrideManager />
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        ) : (
          <Card glass>
            <CardHeader>
              <CardTitle className="text-base">Your organization&rsquo;s features</CardTitle>
              <CardDescription>Read-only — an organization cannot grant itself a feature its plan doesn&rsquo;t include.</CardDescription>
            </CardHeader>
            <CardContent>
              <OrgFeaturesTable features={features} />
            </CardContent>
          </Card>
        )}
      </Container>
    </main>
  );
}
