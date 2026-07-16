import { z } from "zod";

export const subscriptionBillingCycleSchema = z.enum(["MONTHLY", "QUARTERLY", "YEARLY"]);
export type SubscriptionBillingCycleInput = z.infer<typeof subscriptionBillingCycleSchema>;

export const subscriptionStatusSchema = z.enum(["TRIALING", "ACTIVE", "PAUSED", "CANCELLED", "EXPIRED"]);
export type SubscriptionStatusInput = z.infer<typeof subscriptionStatusSchema>;

export const subscriptionSchema = z.object({
  name: z.string().trim().min(1, "Give the subscription a name."),
  companyId: z.string().trim().optional().or(z.literal("")),
  clientId: z.string().trim().optional().or(z.literal("")),
  amount: z.coerce.number().positive("Amount must be greater than 0."),
  currency: z.string().trim().max(10).optional().or(z.literal("")),
  billingCycle: subscriptionBillingCycleSchema.default("MONTHLY"),
  status: subscriptionStatusSchema.default("ACTIVE"),
  startDate: z.coerce.date(),
  renewalDate: z.coerce.date().optional(),
  notes: z.string().trim().max(4000).optional().or(z.literal("")),
});

export type SubscriptionInput = z.input<typeof subscriptionSchema>;
