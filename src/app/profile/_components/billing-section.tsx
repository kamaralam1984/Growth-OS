import { CreditCard, FileWarning, Users } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { BillingPlan, BillingStatus } from "@/generated/prisma/client";

export interface BillingAccountInfo {
  plan: BillingPlan;
  status: BillingStatus;
  seatsIncluded: number;
  renewsAt: Date | null;
}

export interface BillingSectionProps {
  billingAccount: BillingAccountInfo | null;
  seatsUsed: number;
}

const PLAN_LABELS: Record<BillingPlan, string> = {
  FREE: "Free",
  STARTER: "Starter",
  GROWTH: "Growth",
  ENTERPRISE: "Enterprise",
};

const STATUS_LABELS: Record<BillingStatus, string> = {
  ACTIVE: "Active",
  PAST_DUE: "Past due",
  CANCELED: "Canceled",
  TRIALING: "Trialing",
  PAUSED: "Paused",
  INCOMPLETE: "Incomplete",
};

const STATUS_BADGE_VARIANT: Record<BillingStatus, "accent" | "outline" | "secondary"> = {
  ACTIVE: "accent",
  PAST_DUE: "outline",
  CANCELED: "secondary",
  TRIALING: "accent",
  PAUSED: "outline",
  INCOMPLETE: "outline",
};

export function BillingSection({ billingAccount, seatsUsed }: BillingSectionProps) {
  if (!billingAccount) {
    return (
      <Card glass>
        <CardHeader>
          <CardTitle>Billing</CardTitle>
          <CardDescription>Your organization&apos;s plan and seat usage.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border py-12 text-center">
            <FileWarning className="size-6 text-muted-foreground" />
            <p className="max-w-sm text-sm text-muted-foreground">
              No billing account found for your organization yet. Visit the billing dashboard to set one up.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const seatsPct = Math.min(100, Math.round((seatsUsed / billingAccount.seatsIncluded) * 100));

  return (
    <div className="flex flex-col gap-4">
      <Card glass>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>Billing</CardTitle>
            <Badge variant="accent">{PLAN_LABELS[billingAccount.plan]} plan</Badge>
            <Badge variant={STATUS_BADGE_VARIANT[billingAccount.status]}>
              {STATUS_LABELS[billingAccount.status]}
            </Badge>
          </div>
          <CardDescription>
            {billingAccount.renewsAt
              ? `Renews ${billingAccount.renewsAt.toLocaleDateString()}`
              : "No upcoming renewal date on file."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-border p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Users className="size-4" /> Seats
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {seatsUsed} of {billingAccount.seatsIncluded} used
              </p>
              <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${Math.max(seatsPct, seatsUsed > 0 ? 4 : 0)}%` }}
                />
              </div>
            </div>

            <div className="rounded-xl border border-border p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <CreditCard className="size-4" /> Plan
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {PLAN_LABELS[billingAccount.plan]} &middot; {billingAccount.seatsIncluded} seats included
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card glass>
        <CardHeader>
          <CardTitle className="text-base">Invoice history</CardTitle>
          <CardDescription>Platform invoices from GrowthOS for your subscription.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border py-12 text-center">
            <FileWarning className="size-6 text-muted-foreground" />
            <p className="max-w-sm text-sm text-muted-foreground">
              Platform invoice history isn&apos;t tracked yet — there&apos;s no payment processor connected in this
              environment. This is separate from any invoices your organization sends to its own clients.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
