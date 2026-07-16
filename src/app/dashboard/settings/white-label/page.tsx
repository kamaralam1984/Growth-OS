import Link from "next/link";
import { Sparkles } from "lucide-react";

import { Container } from "@/components/ui/container";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { requireActiveMembership } from "../../_lib/require-membership";
import { getWhiteLabelPlanAccess } from "@/lib/white-label/plan-access";
import { getWhiteLabelSettings } from "@/lib/white-label/settings";
import { listCustomDomains } from "@/lib/white-label/domains";
import { BrandSettingsForm } from "./_components/brand-settings-form";
import { CustomDomainsPanel } from "./_components/custom-domains-panel";

const PRIVILEGED_ROLES = new Set(["OWNER", "ADMIN"]);

export default async function WhiteLabelSettingsPage() {
  const { membership } = await requireActiveMembership("/dashboard/settings/white-label");
  const organizationId = membership.organizationId;
  const canManage = PRIVILEGED_ROLES.has(membership.role);

  const planAccess = await getWhiteLabelPlanAccess(organizationId);

  if (!planAccess.whiteLabelAccess) {
    return (
      <Container className="py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-foreground">White label</h1>
          <p className="text-sm text-muted-foreground">Custom branding, custom domains, white-labeled emails and PDFs.</p>
        </div>

        <Card glass className="max-w-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="size-4 text-primary" />
              Available on the Business plan and above
            </CardTitle>
            <CardDescription>
              Your organization&apos;s current plan doesn&apos;t include white labeling. Upgrade to customize your logo,
              colors, login screen, PDF footers, and email sender identity — plus connect your own custom domain.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/dashboard/billing/subscriptions">Upgrade plan</Link>
            </Button>
          </CardContent>
        </Card>
      </Container>
    );
  }

  const [settings, domains] = await Promise.all([
    getWhiteLabelSettings(organizationId),
    planAccess.customDomainAccess ? listCustomDomains(organizationId) : Promise.resolve([]),
  ]);

  return (
    <Container className="py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">White label</h1>
        <p className="text-sm text-muted-foreground">
          Real branding stored on this organization&apos;s WhiteLabelSettings row, gated behind your plan&apos;s
          whiteLabelAccess/customDomainAccess entitlements — never a silently-hidden feature.
        </p>
      </div>

      <div className="flex flex-col gap-6">
        <BrandSettingsForm
          canManage={canManage}
          initial={{
            brandName: settings?.brandName ?? "",
            primaryColor: settings?.primaryColor ?? "",
            secondaryColor: settings?.secondaryColor ?? "",
            fontFamily: settings?.fontFamily ?? "",
            customLoginHeadline: settings?.customLoginHeadline ?? "",
            emailFromName: settings?.emailFromName ?? "",
            emailFromAddress: settings?.emailFromAddress ?? "",
            pdfFooterText: settings?.pdfFooterText ?? "",
            enabled: settings?.enabled ?? false,
            logoUrl: settings?.logoStorageKey ? `/api/white-label/assets/${organizationId}/logo` : null,
            faviconUrl: settings?.faviconStorageKey ? `/api/white-label/assets/${organizationId}/favicon` : null,
          }}
        />

        {planAccess.customDomainAccess ? (
          <CustomDomainsPanel canManage={canManage} domains={domains} />
        ) : (
          <Card glass className="w-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="size-4 text-primary" />
                Custom domains need an additional plan entitlement
              </CardTitle>
              <CardDescription>
                Your plan includes white-label branding but not custom domains. Upgrade to connect your own domain
                (e.g. app.yourcompany.com) with real DNS verification.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline">
                <Link href="/dashboard/billing/subscriptions">Upgrade plan</Link>
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </Container>
  );
}
