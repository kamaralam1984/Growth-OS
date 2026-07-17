"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requirePlatformOwner } from "@/lib/billing/platform-admin";
import { logAudit } from "@/lib/audit";
import { createVendor, updateVendor } from "@/lib/security/vendor-register";
import type { VendorCategory, VendorRiskLevel } from "@/generated/prisma/client";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

const CATEGORIES = new Set<VendorCategory>(["HOSTING", "PAYMENTS", "EMAIL_SMS", "AI_ML", "ANALYTICS", "STORAGE", "OTHER"]);
const RISK_LEVELS = new Set<VendorRiskLevel>(["LOW", "MEDIUM", "HIGH"]);

const createSchema = z.object({
  name: z.string().trim().min(1, "Enter a vendor name.").max(200),
  category: z.string(),
  purpose: z.string().trim().min(1, "Describe what this vendor does.").max(2000),
  dataProcessed: z.string().trim().min(1, "Describe what data flows to this vendor.").max(2000),
  riskLevel: z.string(),
  dpaSigned: z.boolean(),
  dpaReference: z.string().trim().max(500).optional(),
});

export async function createVendorAction(input: unknown): Promise<ActionResult> {
  const { userId } = await requirePlatformOwner("/admin/compliance/vendors");

  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the vendor fields." };
  }
  if (!CATEGORIES.has(parsed.data.category as VendorCategory) || !RISK_LEVELS.has(parsed.data.riskLevel as VendorRiskLevel)) {
    return { ok: false, error: "Choose valid category/risk level." };
  }

  try {
    const vendor = await createVendor({
      name: parsed.data.name,
      category: parsed.data.category as VendorCategory,
      purpose: parsed.data.purpose,
      dataProcessed: parsed.data.dataProcessed,
      riskLevel: parsed.data.riskLevel as VendorRiskLevel,
      dpaSigned: parsed.data.dpaSigned,
      dpaReference: parsed.data.dpaReference,
      createdByUserId: userId,
    });
    await logAudit({ userId, action: "admin.vendor_record_created", metadata: { vendorId: vendor.id, dpaSigned: vendor.dpaSigned } });
    revalidatePath("/admin/compliance/vendors");
    return { ok: true };
  } catch (error) {
    console.error("[admin/compliance/vendors] createVendorAction failed:", error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

const dpaSchema = z.object({
  vendorId: z.string().trim().min(1),
  dpaSigned: z.boolean(),
});

export async function setVendorDpaStatusAction(input: unknown): Promise<ActionResult> {
  const { userId } = await requirePlatformOwner("/admin/compliance/vendors");

  const parsed = dpaSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the fields." };
  }

  try {
    await updateVendor(parsed.data.vendorId, { dpaSigned: parsed.data.dpaSigned });
    await logAudit({ userId, action: "admin.vendor_dpa_updated", metadata: { vendorId: parsed.data.vendorId, dpaSigned: parsed.data.dpaSigned } });
    revalidatePath("/admin/compliance/vendors");
    return { ok: true };
  } catch (error) {
    console.error("[admin/compliance/vendors] setVendorDpaStatusAction failed:", error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}
