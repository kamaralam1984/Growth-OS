import { prisma } from "@/lib/prisma";
import type { VendorRecord, VendorCategory, VendorRiskLevel } from "@/generated/prisma/client";

/**
 * SOC2 CC9.2 vendor management + GDPR Art.28 sub-processor register + Data
 * Processing Register in one model — a real sub-processor gets one row
 * recording what data flows to them and whether a DPA is on file.
 * dpaSigned is an admin attestation captured in a real queryable record
 * (same class of control as AccessReview decisions or the SecurityRisk
 * register below it) — not something code can independently verify a legal
 * document exists, only that an operator recorded it.
 */

export interface CreateVendorInput {
  name: string;
  category: VendorCategory;
  purpose: string;
  dataProcessed: string;
  riskLevel?: VendorRiskLevel;
  dpaSigned?: boolean;
  dpaReference?: string;
  reviewDueAt?: Date;
  createdByUserId?: string;
}

export async function createVendor(input: CreateVendorInput): Promise<VendorRecord> {
  return prisma.vendorRecord.create({
    data: {
      name: input.name,
      category: input.category,
      purpose: input.purpose,
      dataProcessed: input.dataProcessed,
      riskLevel: input.riskLevel || "MEDIUM",
      dpaSigned: input.dpaSigned ?? false,
      dpaSignedAt: input.dpaSigned ? new Date() : null,
      dpaReference: input.dpaReference || null,
      reviewDueAt: input.reviewDueAt || null,
      createdByUserId: input.createdByUserId || null,
    },
  });
}

export interface UpdateVendorInput {
  name?: string;
  category?: VendorCategory;
  purpose?: string;
  dataProcessed?: string;
  riskLevel?: VendorRiskLevel;
  dpaSigned?: boolean;
  dpaReference?: string | null;
  reviewDueAt?: Date | null;
  active?: boolean;
}

export async function updateVendor(id: string, input: UpdateVendorInput): Promise<VendorRecord> {
  const existing = await prisma.vendorRecord.findUniqueOrThrow({ where: { id } });
  const dpaJustSigned = input.dpaSigned === true && !existing.dpaSigned;

  return prisma.vendorRecord.update({
    where: { id },
    data: {
      name: input.name,
      category: input.category,
      purpose: input.purpose,
      dataProcessed: input.dataProcessed,
      riskLevel: input.riskLevel,
      dpaSigned: input.dpaSigned,
      dpaSignedAt: dpaJustSigned ? new Date() : undefined,
      dpaReference: input.dpaReference,
      reviewDueAt: input.reviewDueAt,
      active: input.active,
    },
  });
}

export async function listVendors(): Promise<VendorRecord[]> {
  return prisma.vendorRecord.findMany({ orderBy: [{ active: "desc" }, { dpaSigned: "asc" }, { name: "asc" }] });
}

export interface VendorRegisterSummary {
  total: number;
  active: number;
  dpaSignedCount: number;
  missingDpaCount: number;
}

export async function getVendorRegisterSummary(): Promise<VendorRegisterSummary> {
  const vendors = await prisma.vendorRecord.findMany({ select: { active: true, dpaSigned: true } });
  let active = 0;
  let dpaSignedCount = 0;
  let missingDpaCount = 0;
  for (const v of vendors) {
    if (v.active) active++;
    if (v.dpaSigned) dpaSignedCount++;
    else if (v.active) missingDpaCount++;
  }
  return { total: vendors.length, active, dpaSignedCount, missingDpaCount };
}
