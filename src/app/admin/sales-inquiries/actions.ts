"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { requirePlatformOwner } from "@/lib/billing/platform-admin";
import type { SalesInquiryStatus } from "@/generated/prisma/client";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

const VALID_STATUSES = new Set<SalesInquiryStatus>(["NEW", "CONTACTED", "CLOSED"]);

export async function updateSalesInquiryStatusAction(inquiryId: string, status: string): Promise<ActionResult> {
  const { userId } = await requirePlatformOwner("/admin/sales-inquiries");

  if (!VALID_STATUSES.has(status as SalesInquiryStatus)) {
    return { ok: false, error: "Choose a valid status." };
  }

  const inquiry = await prisma.salesInquiry.findUnique({ where: { id: inquiryId } });
  if (!inquiry) return { ok: false, error: "Inquiry not found." };

  await prisma.salesInquiry.update({ where: { id: inquiryId }, data: { status: status as SalesInquiryStatus } });

  await logAudit({
    userId,
    action: "admin.sales_inquiry_status_updated",
    metadata: { inquiryId, from: inquiry.status, to: status },
  });

  revalidatePath("/admin/sales-inquiries");
  return { ok: true };
}
