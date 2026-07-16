import { prisma } from "@/lib/prisma";

export interface WhiteLabelPlanAccess {
  whiteLabelAccess: boolean;
  customDomainAccess: boolean;
}

/**
 * Direct BillingAccount.currentPlan boolean check, rather than the generic
 * override/plan/default cascade in src/lib/billing/feature-flags.ts's
 * isFeatureEnabled(). whiteLabelAccess/customDomainAccess are dedicated Plan
 * columns (not a generic PlanFeature row), and this gate must always
 * reflect the org's real, current plan — a simple, precise read is clearer
 * here than routing through the generic flag-resolution cascade. Both
 * columns are checked independently: a plan can grant one without the
 * other (e.g. white-label branding without a custom domain add-on), per
 * the schema.
 */
export async function getWhiteLabelPlanAccess(organizationId: string): Promise<WhiteLabelPlanAccess> {
  const billingAccount = await prisma.billingAccount.findUnique({
    where: { organizationId },
    include: { currentPlan: true },
  });

  return {
    whiteLabelAccess: billingAccount?.currentPlan?.whiteLabelAccess ?? false,
    customDomainAccess: billingAccount?.currentPlan?.customDomainAccess ?? false,
  };
}
