import { prisma } from "@/lib/prisma";
import type { AssetRecord, AssetType, DataClassification, AssetStatus } from "@/generated/prisma/client";

/**
 * ISO27001 A.5.9 "inventory of information and other associated assets" —
 * real admin-tracked assets (infra components, data stores, key documents),
 * each with an owner and a data classification.
 */

export interface CreateAssetInput {
  name: string;
  assetType: AssetType;
  description: string;
  classification?: DataClassification;
  ownerUserId?: string;
  location?: string;
  createdByUserId?: string;
}

export async function createAsset(input: CreateAssetInput): Promise<AssetRecord> {
  return prisma.assetRecord.create({
    data: {
      name: input.name,
      assetType: input.assetType,
      description: input.description,
      classification: input.classification || "INTERNAL",
      ownerUserId: input.ownerUserId || null,
      location: input.location || null,
      createdByUserId: input.createdByUserId || null,
    },
  });
}

export interface UpdateAssetInput {
  name?: string;
  assetType?: AssetType;
  description?: string;
  classification?: DataClassification;
  ownerUserId?: string | null;
  location?: string | null;
  status?: AssetStatus;
}

export async function updateAsset(id: string, input: UpdateAssetInput): Promise<AssetRecord> {
  return prisma.assetRecord.update({
    where: { id },
    data: {
      name: input.name,
      assetType: input.assetType,
      description: input.description,
      classification: input.classification,
      ownerUserId: input.ownerUserId,
      location: input.location,
      status: input.status,
    },
  });
}

export async function listAssets(): Promise<AssetRecord[]> {
  return prisma.assetRecord.findMany({ orderBy: [{ status: "asc" }, { assetType: "asc" }, { name: "asc" }] });
}

export interface AssetInventorySummary {
  total: number;
  active: number;
  byClassification: Record<DataClassification, number>;
}

export async function getAssetInventorySummary(): Promise<AssetInventorySummary> {
  const assets = await prisma.assetRecord.findMany({ select: { status: true, classification: true } });
  const byClassification: Record<DataClassification, number> = { PUBLIC: 0, INTERNAL: 0, CONFIDENTIAL: 0, RESTRICTED: 0 };
  let active = 0;
  for (const a of assets) {
    byClassification[a.classification]++;
    if (a.status === "ACTIVE") active++;
  }
  return { total: assets.length, active, byClassification };
}
