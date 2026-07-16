import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Bot } from "lucide-react";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Container } from "@/components/ui/container";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";

import { PersonalInfoForm } from "./_components/personal-info-form";
import { SecuritySection } from "./_components/security-section";
import { NotificationsForm } from "./_components/notifications-form";
import { ConnectedAccounts } from "./_components/connected-accounts";
import { PreferencesForm } from "./_components/preferences-form";
import { AiSettingsSection } from "./_components/ai-settings-section";
import { ApiKeysSection } from "./_components/api-keys-section";
import { BillingSection } from "./_components/billing-section";
import { PrivacyDataSection } from "./_components/privacy-data-section";

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login?callbackUrl=%2Fprofile");
  }
  const userId = session.user.id;

  const [user, preference, deviceSessions, accounts, membership, apiKeys, securityEvents] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.userPreference.findUnique({ where: { userId } }),
    prisma.deviceSession.findMany({ where: { userId }, orderBy: { lastActiveAt: "desc" } }),
    prisma.account.findMany({ where: { userId }, select: { id: true, provider: true } }),
    prisma.membership.findFirst({
      where: { userId, status: "ACTIVE" },
      orderBy: { createdAt: "asc" },
      include: { organization: { include: { aiAgents: { orderBy: { createdAt: "asc" } } } } },
    }),
    prisma.apiKey.findMany({ where: { userId }, orderBy: { createdAt: "desc" } }),
    prisma.auditLog.findMany({
      where: { userId, action: "auth.suspicious_login_detected" },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);

  if (!user) {
    redirect("/login?callbackUrl=%2Fprofile");
  }

  const [billingAccount, activeSeatsCount] = membership
    ? await Promise.all([
        prisma.billingAccount.findUnique({ where: { organizationId: membership.organizationId } }),
        prisma.membership.count({ where: { organizationId: membership.organizationId, status: "ACTIVE" } }),
      ])
    : [null, 0];

  return (
    <main className="min-h-svh bg-background py-12">
      <Container className="flex flex-col gap-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              Your profile
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Manage your personal details, security, notifications, and AI workforce settings.
            </p>
          </div>
          {membership && (
            <Button asChild variant="outline">
              <Link href="/board">
                <Bot className="size-4" />
                AI Executive Board
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          )}
        </div>

        <Tabs defaultValue="personal">
          <TabsList className="flex-wrap">
            <TabsTrigger value="personal">Personal</TabsTrigger>
            <TabsTrigger value="security">Security</TabsTrigger>
            <TabsTrigger value="notifications">Notifications</TabsTrigger>
            <TabsTrigger value="connected">Connected Accounts</TabsTrigger>
            <TabsTrigger value="api-keys">API Keys</TabsTrigger>
            <TabsTrigger value="billing">Billing</TabsTrigger>
            <TabsTrigger value="preferences">Preferences</TabsTrigger>
            <TabsTrigger value="ai-settings">AI Settings</TabsTrigger>
            <TabsTrigger value="privacy">Privacy & Data</TabsTrigger>
          </TabsList>

          <TabsContent value="personal">
            <PersonalInfoForm
              initial={{
                firstName: user.firstName ?? "",
                lastName: user.lastName ?? "",
                phone: user.phone ?? "",
                country: user.country ?? "",
                language: user.language ?? "",
                timezone: user.timezone ?? "",
                jobTitle: user.jobTitle ?? "",
                image: user.image ?? "",
              }}
              email={user.email ?? ""}
            />
          </TabsContent>

          <TabsContent value="security">
            <SecuritySection
              twoFactorEnabled={user.twoFactorEnabled}
              hasPassword={Boolean(user.password)}
              deviceSessions={deviceSessions.map((d) => ({
                id: d.id,
                deviceName: d.deviceName,
                userAgent: d.userAgent,
                ipAddress: d.ipAddress,
                lastActiveAt: d.lastActiveAt.toISOString(),
              }))}
              securityEvents={securityEvents.map((e) => ({
                id: e.id,
                ipAddress: e.ipAddress,
                userAgent: e.userAgent,
                createdAt: e.createdAt.toISOString(),
              }))}
            />
          </TabsContent>

          <TabsContent value="notifications">
            <NotificationsForm
              initial={{
                emailNotifications: preference?.emailNotifications ?? true,
                browserNotifications: preference?.browserNotifications ?? true,
                slackNotifications: preference?.slackNotifications ?? false,
                teamsNotifications: preference?.teamsNotifications ?? false,
                slackWebhookUrl: preference?.slackWebhookUrl ?? "",
                teamsWebhookUrl: preference?.teamsWebhookUrl ?? "",
              }}
            />
          </TabsContent>

          <TabsContent value="connected">
            <ConnectedAccounts accounts={accounts} />
          </TabsContent>

          <TabsContent value="api-keys">
            <ApiKeysSection
              initialKeys={apiKeys.map((key) => ({
                id: key.id,
                name: key.name,
                prefix: key.prefix,
                scopes: key.scopes,
                lastUsedAt: key.lastUsedAt ? key.lastUsedAt.toISOString() : null,
                revokedAt: key.revokedAt ? key.revokedAt.toISOString() : null,
                createdAt: key.createdAt.toISOString(),
              }))}
            />
          </TabsContent>

          <TabsContent value="billing">
            <BillingSection
              billingAccount={
                billingAccount
                  ? {
                      plan: billingAccount.plan,
                      status: billingAccount.status,
                      seatsIncluded: billingAccount.seatsIncluded,
                      renewsAt: billingAccount.renewsAt,
                    }
                  : null
              }
              seatsUsed={activeSeatsCount}
            />
          </TabsContent>

          <TabsContent value="preferences">
            <PreferencesForm
              initial={{
                theme: (preference?.theme as "light" | "dark" | "system") ?? "dark",
                locale: preference?.locale ?? "en",
              }}
            />
          </TabsContent>

          <TabsContent value="ai-settings">
            <AiSettingsSection
              organizationName={membership?.organization.name ?? null}
              agents={
                membership?.organization.aiAgents.map((agent) => ({
                  id: agent.id,
                  type: agent.type,
                  name: agent.name,
                  active: agent.active,
                })) ?? []
              }
            />
          </TabsContent>

          <TabsContent value="privacy">
            <PrivacyDataSection hasPassword={Boolean(user.password)} />
          </TabsContent>
        </Tabs>
      </Container>
    </main>
  );
}
