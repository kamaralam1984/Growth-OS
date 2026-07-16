"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { logAudit } from "@/lib/audit";
import { generateLicenseKey, revokeLicense } from "@/lib/billing/licenses";
import type { LicenseType } from "@/generated/prisma/client";
import { resolveActiveMembership } from "@/app/dashboard/_lib/require-membership";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

const PRIVILEGED_ROLES = new Set(["OWNER", "ADMIN"]);
const LICENSE_TYPES = new Set<LicenseType>(["API", "SEAT", "ENTERPRISE"]);

async function requirePrivileged(): Promise<ActionResult & { organizationId?: string; userId?: string }> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const membership = await resolveActiveMembership(userId);
  if (!membership) return { ok: false, error: "You don't belong to an organization yet." };
  if (!PRIVILEGED_ROLES.has(membership.role)) {
    return { ok: false, error: "Only owners and admins can manage licenses." };
  }
  return { ok: true, organizationId: membership.organizationId, userId };
}

export interface GenerateLicenseInput {
  type: string;
  seats?: number;
  expiresAt?: string;
}

/** Issues a new License for the caller's organization. Returns the raw key exactly once — the UI must show/copy it immediately, since the list view afterward only ever renders a masked key. */
export async function generateLicenseAction(input: GenerateLicenseInput): Promise<ActionResult & { key?: string }> {
  const access = await requirePrivileged();
  if (!access.ok || !access.organizationId) return access;

  if (!LICENSE_TYPES.has(input.type as LicenseType)) {
    return { ok: false, error: "Choose a valid license type." };
  }
  const type = input.type as LicenseType;
  const seats = type === "SEAT" && input.seats && input.seats > 0 ? Math.floor(input.seats) : undefined;
  const expiresAt = input.expiresAt ? new Date(input.expiresAt) : undefined;
  if (expiresAt && Number.isNaN(expiresAt.getTime())) {
    return { ok: false, error: "Enter a valid expiry date." };
  }

  try {
    const license = await generateLicenseKey(access.organizationId, type, seats, expiresAt);
    await logAudit({
      userId: access.userId,
      organizationId: access.organizationId,
      action: "license.generated",
      metadata: { licenseId: license.id, type: license.type },
    });
    revalidatePath("/dashboard/settings/licenses");
    return { ok: true, key: license.key };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not generate a license." };
  }
}

export async function revokeLicenseAction(licenseId: string): Promise<ActionResult> {
  const access = await requirePrivileged();
  if (!access.ok || !access.organizationId) return access;

  try {
    await revokeLicense(licenseId, access.organizationId);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not revoke this license." };
  }

  await logAudit({
    userId: access.userId,
    organizationId: access.organizationId,
    action: "license.revoked",
    metadata: { licenseId },
  });
  revalidatePath("/dashboard/settings/licenses");
  return { ok: true };
}
