"use server";

import { revalidatePath } from "next/cache";

import { requirePlatformOwner } from "@/lib/billing/platform-admin";
import { refundMarketplaceOrder } from "@/lib/marketplace/checkout";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

/** Platform-operator-only — a marketplace refund is a cross-tenant money-moving decision, same gate as every other /admin/* action. */
export async function refundMarketplaceOrderAction(orderId: string): Promise<ActionResult> {
  const admin = await requirePlatformOwner("/admin/marketplace/orders");
  const result = await refundMarketplaceOrder(orderId, admin.userId);
  revalidatePath("/admin/marketplace/orders");
  return result;
}
