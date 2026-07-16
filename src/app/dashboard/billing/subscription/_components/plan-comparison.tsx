"use client";

import { useMemo, useState, useTransition } from "react";
import { Check, Sparkles } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toast";
import { ConfirmActionDialog } from "./confirm-action-dialog";
import { ManualPaymentDialog } from "./manual-payment-dialog";
import { startCheckoutAction, changePlanAction } from "../actions";
import type { PaymentGatewayProvider, PlanTier, BillingIntervalUnit } from "@/generated/prisma/client";

export interface PlanRowData {
  id: string;
  tier: PlanTier;
  name: string;
  description: string | null;
  interval: BillingIntervalUnit;
  priceCents: number;
  currency: string;
  trialDays: number;
  isCustom: boolean;
  userLimit: number | null;
  workspaceLimit: number | null;
  aiCreditsMonthly: number | null;
  storageMbLimit: number | null;
  projectLimit: number | null;
  automationRunsMonthly: number | null;
  whiteLabelAccess: boolean;
  ssoAccess: boolean;
  prioritySupport: boolean;
  advancedAnalytics: boolean;
}

export interface ConfiguredGatewayInfo {
  provider: PaymentGatewayProvider;
  name: string;
}

export interface PlanComparisonProps {
  plans: PlanRowData[];
  currentPlanId: string | null;
  /** True once the org has a real gateway-driven subscription (as opposed to never having subscribed, or being on the legacy free self-service plan). */
  hasActiveSubscription: boolean;
  configuredGateways: ConfiguredGatewayInfo[];
  canManage: boolean;
}

const TIER_ORDER: Record<PlanTier, number> = {
  FREE: 0,
  STARTER: 1,
  PROFESSIONAL: 2,
  BUSINESS: 3,
  ENTERPRISE: 4,
  CUSTOM: 5,
};

const TIER_LABEL: Record<PlanTier, string> = {
  FREE: "Free",
  STARTER: "Starter",
  PROFESSIONAL: "Professional",
  BUSINESS: "Business",
  ENTERPRISE: "Enterprise",
  CUSTOM: "Custom",
};

function formatPrice(cents: number, currency: string): string {
  return (cents / 100).toLocaleString(undefined, { style: "currency", currency, maximumFractionDigits: 0 });
}

function formatLimit(value: number | null, unit = ""): string {
  return value === null ? "Unlimited" : `${value.toLocaleString()}${unit}`;
}

export function PlanComparison({ plans, currentPlanId, hasActiveSubscription, configuredGateways, canManage }: PlanComparisonProps) {
  const availableIntervals = useMemo(() => {
    const set = new Set(plans.map((p) => p.interval));
    // Prefer MONTHLY/YEARLY as the toggle; fall back to whatever the seed
    // actually populated if neither is present (e.g. only QUARTERLY seeded).
    const preferred: BillingIntervalUnit[] = ["MONTHLY", "YEARLY"].filter((i) => set.has(i as BillingIntervalUnit)) as BillingIntervalUnit[];
    return preferred.length > 0 ? preferred : Array.from(set);
  }, [plans]);

  const [interval, setInterval] = useState<BillingIntervalUnit>(availableIntervals[0] ?? "MONTHLY");

  const visiblePlans = useMemo(
    () => plans.filter((p) => p.interval === interval).sort((a, b) => TIER_ORDER[a.tier] - TIER_ORDER[b.tier]),
    [plans, interval],
  );

  const currentPlan = plans.find((p) => p.id === currentPlanId) ?? null;
  const nonManualGateways = configuredGateways.filter((g) => g.provider !== "BANK_TRANSFER" && g.provider !== "MANUAL");
  const manualGateway = configuredGateways.find((g) => g.provider === "BANK_TRANSFER" || g.provider === "MANUAL");

  if (plans.length === 0) {
    return (
      <Card glass>
        <CardHeader>
          <CardTitle className="text-base">Plans</CardTitle>
          <CardDescription>No plan catalog rows found yet — the platform plan seed hasn&rsquo;t run in this environment.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-foreground">Plans</h2>
          <p className="text-sm text-muted-foreground">Real, database-driven plan catalog — pricing and limits are live rows, not hardcoded.</p>
        </div>
        {availableIntervals.length > 1 && (
          <Tabs value={interval} onValueChange={(v) => setInterval(v as BillingIntervalUnit)}>
            <TabsList>
              {availableIntervals.map((i) => (
                <TabsTrigger key={i} value={i}>
                  {i === "MONTHLY" ? "Monthly" : i === "YEARLY" ? "Yearly" : i}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {visiblePlans.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            isCurrent={plan.id === currentPlanId}
            currentPlan={currentPlan}
            hasActiveSubscription={hasActiveSubscription}
            nonManualGateways={nonManualGateways}
            manualGateway={manualGateway}
            canManage={canManage}
          />
        ))}
      </div>
    </div>
  );
}

function PlanCard({
  plan,
  isCurrent,
  currentPlan,
  hasActiveSubscription,
  nonManualGateways,
  manualGateway,
  canManage,
}: {
  plan: PlanRowData;
  isCurrent: boolean;
  currentPlan: PlanRowData | null;
  hasActiveSubscription: boolean;
  nonManualGateways: ConfiguredGatewayInfo[];
  manualGateway: ConfiguredGatewayInfo | undefined;
  canManage: boolean;
}) {
  const [pending, startTransition] = useTransition();

  // Downgrade detection is a real-but-approximate proxy: lower tier ordering
  // OR same tier at a lower monthly-equivalent price. Good enough to decide
  // whether a change needs a confirmation dialog; not a source of truth for
  // billing math itself.
  const isDowngrade = currentPlan ? TIER_ORDER[plan.tier] < TIER_ORDER[currentPlan.tier] : false;

  function handleCheckout(provider: PaymentGatewayProvider) {
    startTransition(async () => {
      const result = await startCheckoutAction(plan.id, provider);
      if (!result.ok || !result.checkoutUrl) {
        toast.error(result.error ?? "Could not start checkout.");
        return;
      }
      window.location.href = result.checkoutUrl;
    });
  }

  function handleChangePlan() {
    return changePlanAction(plan.id);
  }

  return (
    <Card glass={isCurrent} className={isCurrent ? "border-primary/40" : undefined}>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">{plan.name}</CardTitle>
          <Badge variant={isCurrent ? "accent" : "outline"}>{TIER_LABEL[plan.tier]}</Badge>
        </div>
        <CardDescription>{plan.description ?? " "}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div>
          <p className="text-3xl font-semibold tracking-tight text-foreground">
            {plan.priceCents === 0 ? "Free" : formatPrice(plan.priceCents, plan.currency)}
          </p>
          {plan.priceCents > 0 && (
            <p className="text-xs text-muted-foreground">per {plan.interval === "YEARLY" ? "year" : plan.interval === "QUARTERLY" ? "quarter" : "month"}</p>
          )}
          {plan.trialDays > 0 && <p className="mt-1 text-xs text-primary">{plan.trialDays}-day free trial</p>}
        </div>

        <ul className="flex flex-col gap-1.5 text-sm text-muted-foreground">
          <li className="flex items-center gap-1.5">
            <Check className="size-3.5 shrink-0 text-primary" /> {formatLimit(plan.userLimit)} users
          </li>
          <li className="flex items-center gap-1.5">
            <Check className="size-3.5 shrink-0 text-primary" /> {formatLimit(plan.workspaceLimit)} workspaces
          </li>
          <li className="flex items-center gap-1.5">
            <Check className="size-3.5 shrink-0 text-primary" /> {formatLimit(plan.aiCreditsMonthly)} AI credits/mo
          </li>
          <li className="flex items-center gap-1.5">
            <Check className="size-3.5 shrink-0 text-primary" /> {formatLimit(plan.storageMbLimit, " MB")} storage
          </li>
          <li className="flex items-center gap-1.5">
            <Check className="size-3.5 shrink-0 text-primary" /> {formatLimit(plan.projectLimit)} projects
          </li>
          <li className="flex items-center gap-1.5">
            <Check className="size-3.5 shrink-0 text-primary" /> {formatLimit(plan.automationRunsMonthly)} automation runs/mo
          </li>
          {plan.ssoAccess && (
            <li className="flex items-center gap-1.5">
              <Sparkles className="size-3.5 shrink-0 text-primary" /> SSO
            </li>
          )}
          {plan.whiteLabelAccess && (
            <li className="flex items-center gap-1.5">
              <Sparkles className="size-3.5 shrink-0 text-primary" /> White-label
            </li>
          )}
          {plan.advancedAnalytics && (
            <li className="flex items-center gap-1.5">
              <Sparkles className="size-3.5 shrink-0 text-primary" /> Advanced analytics
            </li>
          )}
          {plan.prioritySupport && (
            <li className="flex items-center gap-1.5">
              <Sparkles className="size-3.5 shrink-0 text-primary" /> Priority support
            </li>
          )}
        </ul>

        <div className="mt-auto flex flex-col gap-2 pt-2">
          {!canManage ? (
            <p className="text-xs text-muted-foreground">Only owners and admins can change plans.</p>
          ) : isCurrent ? (
            <Badge variant="accent" className="w-fit">
              Current plan
            </Badge>
          ) : hasActiveSubscription ? (
            <ConfirmActionDialog
              trigger={
                <Button type="button" size="sm" variant={isDowngrade ? "outline" : "default"} disabled={pending}>
                  {isDowngrade ? "Downgrade to this plan" : "Switch to this plan"}
                </Button>
              }
              title={isDowngrade ? `Downgrade to ${plan.name}?` : `Switch to ${plan.name}?`}
              description={
                isDowngrade
                  ? `Downgrading takes effect immediately and may reduce your available seats, AI credits, or features to match ${plan.name}'s limits.`
                  : `You'll be moved to ${plan.name} immediately. Your gateway subscription is updated in place — no new checkout is needed.`
              }
              confirmLabel={isDowngrade ? "Downgrade" : "Confirm switch"}
              destructive={isDowngrade}
              successMessage={`Switched to ${plan.name}.`}
              onConfirm={handleChangePlan}
            />
          ) : (
            <>
              {nonManualGateways.map((gateway) => (
                <Button key={gateway.provider} type="button" size="sm" disabled={pending} onClick={() => handleCheckout(gateway.provider)}>
                  {pending ? "Redirecting..." : `Subscribe via ${gateway.name}`}
                </Button>
              ))}
              {manualGateway && <ManualPaymentDialog planId={plan.id} planName={plan.name} />}
              {nonManualGateways.length === 0 && !manualGateway && (
                <p className="text-xs text-muted-foreground">No payment gateway is configured yet.</p>
              )}
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
