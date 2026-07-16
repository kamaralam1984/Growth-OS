"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { getWhiteLabelPlanAccess } from "@/lib/white-label/plan-access";
import { upsertWhiteLabelSettings, uploadWhiteLabelLogo } from "@/lib/white-label/settings";
import { addCustomDomain, removeCustomDomain, verifyCustomDomain } from "@/lib/white-label/domains";
import { upsertWhiteLabelSettingsSchema } from "@/lib/validations/white-label";
import { resolveActiveMembership } from "@/app/dashboard/_lib/require-membership";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

const PRIVILEGED_ROLES = new Set(["OWNER", "ADMIN"]);
const PAGE_PATH = "/dashboard/settings/white-label";

/** Same requirePrivileged shape as src/app/dashboard/settings/integrations/actions.ts's — every mutation here goes through it, plus the plan-access re-check each caller needs (whiteLabelAccess for brand settings, customDomainAccess for domains). */
async function requirePrivileged(): Promise<ActionResult & { organizationId?: string; userId?: string }> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const membership = await resolveActiveMembership(userId);
  if (!membership) return { ok: false, error: "You don't belong to an organization yet." };
  if (!PRIVILEGED_ROLES.has(membership.role)) return { ok: false, error: "Only owners and admins can manage white-label settings." };

  return { ok: true, organizationId: membership.organizationId, userId };
}

/**
 * Real multipart form submission — text fields validated via
 * upsertWhiteLabelSettingsSchema, plus two optional file inputs (logo,
 * favicon) that, when present, are uploaded via uploadWhiteLabelLogo before
 * the rest of the settings are saved. Defense in depth: re-checks
 * whiteLabelAccess here even though the page already hides the form when
 * the plan doesn't include it, so this action can never be used to bypass
 * that gate directly.
 */
export async function updateBrandSettingsAction(formData: FormData): Promise<ActionResult> {
  const access = await requirePrivileged();
  if (!access.ok || !access.organizationId || !access.userId) return access;
  const { organizationId, userId } = access;

  const planAccess = await getWhiteLabelPlanAccess(organizationId);
  if (!planAccess.whiteLabelAccess) {
    return { ok: false, error: "White labeling isn't included in your organization's current plan." };
  }

  const parsed = upsertWhiteLabelSettingsSchema.safeParse({
    brandName: formData.get("brandName"),
    primaryColor: formData.get("primaryColor"),
    secondaryColor: formData.get("secondaryColor"),
    fontFamily: formData.get("fontFamily"),
    customLoginHeadline: formData.get("customLoginHeadline"),
    emailFromName: formData.get("emailFromName"),
    emailFromAddress: formData.get("emailFromAddress"),
    pdfFooterText: formData.get("pdfFooterText"),
    enabled: formData.get("enabled") === "on",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form for errors." };
  }

  try {
    const logoFile = formData.get("logoFile");
    if (logoFile instanceof File && logoFile.size > 0) {
      await uploadWhiteLabelLogo(organizationId, logoFile, "logo");
    }
    const faviconFile = formData.get("faviconFile");
    if (faviconFile instanceof File && faviconFile.size > 0) {
      await uploadWhiteLabelLogo(organizationId, faviconFile, "favicon");
    }

    await upsertWhiteLabelSettings(organizationId, parsed.data);

    await logAudit({
      userId,
      organizationId,
      action: "white_label.settings_updated",
      metadata: { enabled: parsed.data.enabled },
    });

    revalidatePath(PAGE_PATH);
    return { ok: true };
  } catch (error) {
    console.error("[white-label] updateBrandSettingsAction failed:", error);
    return { ok: false, error: error instanceof Error ? error.message : "Something went wrong saving these settings." };
  }
}

export async function addCustomDomainAction(formData: FormData): Promise<ActionResult> {
  const access = await requirePrivileged();
  if (!access.ok || !access.organizationId || !access.userId) return access;
  const { organizationId, userId } = access;

  const planAccess = await getWhiteLabelPlanAccess(organizationId);
  if (!planAccess.customDomainAccess) {
    return { ok: false, error: "Custom domains aren't included in your organization's current plan." };
  }

  const domain = String(formData.get("domain") ?? "");

  try {
    const created = await addCustomDomain(organizationId, domain);
    await logAudit({ userId, organizationId, action: "white_label.domain_added", metadata: { domain: created.domain } });
    revalidatePath(PAGE_PATH);
    return { ok: true };
  } catch (error) {
    console.error("[white-label] addCustomDomainAction failed:", error);
    return { ok: false, error: error instanceof Error ? error.message : "Could not add this domain." };
  }
}

export async function verifyCustomDomainAction(domainId: string): Promise<ActionResult & { detail?: string }> {
  const access = await requirePrivileged();
  if (!access.ok || !access.organizationId || !access.userId) return access;
  const { organizationId, userId } = access;

  const planAccess = await getWhiteLabelPlanAccess(organizationId);
  if (!planAccess.customDomainAccess) {
    return { ok: false, error: "Custom domains aren't included in your organization's current plan." };
  }

  const domain = await prisma.customDomain.findUnique({ where: { id: domainId }, include: { whiteLabelSettings: true } });
  if (!domain || domain.whiteLabelSettings.organizationId !== organizationId) {
    return { ok: false, error: "Domain not found." };
  }

  const result = await verifyCustomDomain(domainId);
  await logAudit({
    userId,
    organizationId,
    action: "white_label.domain_verify_attempted",
    metadata: { domain: domain.domain, verified: result.verified, detail: result.detail },
  });
  revalidatePath(PAGE_PATH);
  return { ok: true, detail: result.detail };
}

export async function removeCustomDomainAction(domainId: string): Promise<ActionResult> {
  const access = await requirePrivileged();
  if (!access.ok || !access.organizationId || !access.userId) return access;
  const { organizationId, userId } = access;

  const domain = await prisma.customDomain.findUnique({ where: { id: domainId } });
  await removeCustomDomain(domainId, organizationId);

  await logAudit({ userId, organizationId, action: "white_label.domain_removed", metadata: { domain: domain?.domain } });
  revalidatePath(PAGE_PATH);
  return { ok: true };
}
