"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requirePlatformOwner } from "@/lib/billing/platform-admin";
import { logAudit } from "@/lib/audit";
import { createAsset, updateAsset } from "@/lib/security/asset-inventory";
import type { AssetType, DataClassification, AssetStatus } from "@/generated/prisma/client";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

const ASSET_TYPES = new Set<AssetType>(["HARDWARE", "SOFTWARE", "CLOUD_SERVICE", "DATA_STORE", "DOCUMENT", "OTHER"]);
const CLASSIFICATIONS = new Set<DataClassification>(["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED"]);
const STATUSES = new Set<AssetStatus>(["ACTIVE", "RETIRED"]);

const createSchema = z.object({
  name: z.string().trim().min(1, "Enter an asset name.").max(200),
  assetType: z.string(),
  description: z.string().trim().min(1, "Describe the asset.").max(2000),
  classification: z.string(),
  location: z.string().trim().max(300).optional(),
});

export async function createAssetAction(input: unknown): Promise<ActionResult> {
  const { userId } = await requirePlatformOwner("/admin/compliance/assets");

  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the asset fields." };
  }
  if (!ASSET_TYPES.has(parsed.data.assetType as AssetType) || !CLASSIFICATIONS.has(parsed.data.classification as DataClassification)) {
    return { ok: false, error: "Choose valid asset type/classification." };
  }

  try {
    const asset = await createAsset({
      name: parsed.data.name,
      assetType: parsed.data.assetType as AssetType,
      description: parsed.data.description,
      classification: parsed.data.classification as DataClassification,
      location: parsed.data.location,
      createdByUserId: userId,
    });
    await logAudit({ userId, action: "admin.asset_record_created", metadata: { assetId: asset.id } });
    revalidatePath("/admin/compliance/assets");
    return { ok: true };
  } catch (error) {
    console.error("[admin/compliance/assets] createAssetAction failed:", error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

const statusSchema = z.object({
  assetId: z.string().trim().min(1),
  status: z.string(),
});

export async function updateAssetStatusAction(input: unknown): Promise<ActionResult> {
  const { userId } = await requirePlatformOwner("/admin/compliance/assets");

  const parsed = statusSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the fields." };
  }
  if (!STATUSES.has(parsed.data.status as AssetStatus)) {
    return { ok: false, error: "Choose a valid status." };
  }

  try {
    await updateAsset(parsed.data.assetId, { status: parsed.data.status as AssetStatus });
    await logAudit({ userId, action: "admin.asset_record_updated", metadata: { assetId: parsed.data.assetId, status: parsed.data.status } });
    revalidatePath("/admin/compliance/assets");
    return { ok: true };
  } catch (error) {
    console.error("[admin/compliance/assets] updateAssetStatusAction failed:", error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}
