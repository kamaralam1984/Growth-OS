import { Repeat } from "lucide-react";

import { Container } from "@/components/ui/container";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/prisma";
import { formatCurrency } from "../../_lib/format";
import { requireActiveMembership } from "../../_lib/require-membership";
import { getMRR, getARR } from "@/lib/revenue/subscriptions";
import { SubscriptionForm } from "./_components/subscription-form";
import { CancelSubscriptionButton } from "./_components/cancel-subscription-button";

const STATUS_VARIANT: Record<string, "outline" | "accent" | "default" | "secondary"> = {
  TRIALING: "outline",
  ACTIVE: "accent",
  PAUSED: "secondary",
  CANCELLED: "secondary",
  EXPIRED: "secondary",
};

export default async function SubscriptionsPage() {
  const { membership } = await requireActiveMembership("/dashboard/billing/subscriptions");
  const organizationId = membership.organizationId;
  const currency = membership.organization.currency;

  const [subscriptions, companies, clients, mrr, arr] = await Promise.all([
    prisma.subscription.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      include: { company: { select: { name: true } }, client: { select: { name: true } } },
    }),
    prisma.company.findMany({ where: { organizationId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.client.findMany({ where: { organizationId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    getMRR(organizationId),
    getARR(organizationId),
  ]);

  return (
    <main className="py-8">
      <Container className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Subscriptions</h1>
            <p className="text-sm text-muted-foreground">
              Your customers&rsquo; recurring revenue — manually logged, real MRR/ARR. Not your GrowthOS plan (see Billing).
            </p>
          </div>
          <SubscriptionForm companies={companies} clients={clients} currency={currency} />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Card glass>
            <CardContent className="p-5">
              <p className="text-xs text-muted-foreground">Monthly Recurring Revenue</p>
              <p className="text-2xl font-semibold text-foreground">{formatCurrency(mrr, currency)}</p>
              <p className="mt-1 text-xs text-muted-foreground">Sum of ACTIVE subscriptions, normalized to a monthly amount.</p>
            </CardContent>
          </Card>
          <Card glass>
            <CardContent className="p-5">
              <p className="text-xs text-muted-foreground">Annual Recurring Revenue</p>
              <p className="text-2xl font-semibold text-foreground">{formatCurrency(arr, currency)}</p>
              <p className="mt-1 text-xs text-muted-foreground">MRR × 12.</p>
            </CardContent>
          </Card>
        </div>

        {subscriptions.length === 0 ? (
          <Card glass>
            <CardContent className="flex flex-col items-center gap-3 p-12 text-center">
              <Repeat className="size-8 text-muted-foreground" strokeWidth={1.5} />
              <p className="text-sm text-muted-foreground">No subscriptions logged yet.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col gap-2">
            {subscriptions.map((sub) => (
              <Card glass key={sub.id}>
                <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div>
                    <p className="font-medium text-foreground">{sub.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {sub.client?.name ?? sub.company?.name ?? "No linked company/client"} · {sub.billingCycle.toLowerCase()} ·
                      started {sub.startDate.toLocaleDateString()}
                      {sub.renewalDate ? ` · renews ${sub.renewalDate.toLocaleDateString()}` : ""}
                      {sub.cancelledAt ? ` · cancelled ${sub.cancelledAt.toLocaleDateString()}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-sm font-medium text-primary">{formatCurrency(sub.amount, sub.currency ?? currency)}</span>
                    <Badge variant={STATUS_VARIANT[sub.status]}>{sub.status}</Badge>
                    <SubscriptionForm
                      companies={companies}
                      clients={clients}
                      currency={currency}
                      trigger={<>Edit</>}
                      initial={{
                        id: sub.id,
                        name: sub.name,
                        companyId: sub.companyId,
                        clientId: sub.clientId,
                        amount: sub.amount,
                        currency: sub.currency,
                        billingCycle: sub.billingCycle,
                        status: sub.status,
                        startDate: sub.startDate,
                        renewalDate: sub.renewalDate,
                        notes: sub.notes,
                      }}
                    />
                    {sub.status !== "CANCELLED" && <CancelSubscriptionButton subscriptionId={sub.id} name={sub.name} />}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </Container>
    </main>
  );
}
