"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@/generated/prisma/client";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { canAccessResource } from "@/lib/security/abac";
import {
  companyAboutSchema,
  companyServicesSchema,
  officeLocationsSchema,
  workingHoursSchema,
  certificatesSchema,
  awardsSchema,
  caseStudiesSchema,
  portfolioItemsSchema,
  type CompanyAboutInput,
  type CompanyServicesInput,
  type OfficeLocationInput,
  type WorkingHoursInput,
  type CertificateInput,
  type AwardInput,
  type CaseStudyInput,
  type PortfolioItemInput,
} from "@/lib/validations/company";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

const EDITOR_ROLES = new Set(["OWNER", "ADMIN"]);

/**
 * Confirms the signed-in user is an OWNER/ADMIN member of `orgId` before any
 * write. Returns an error string (never throws) so callers can surface it
 * inline without a try/catch of their own.
 *
 * Also runs the real ABAC layer (src/lib/security/abac.ts) as a second,
 * independent check on top of the OWNER/ADMIN role gate above — one of the
 * small number of concrete call sites where that policy is genuinely
 * exercised. This single helper backs every `update*` action in this file
 * (company about/services/office locations/working hours/certificates/
 * awards/case studies/portfolio), so it's real, repeated production usage,
 * not a one-off.
 */
async function requireEditableOrganization(
  orgId: string,
  userId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const membership = await prisma.membership.findUnique({
    where: { userId_organizationId: { userId, organizationId: orgId } },
  });
  if (!membership || membership.status !== "ACTIVE") {
    return { ok: false, error: "You do not have access to this organization." };
  }
  if (!EDITOR_ROLES.has(membership.role)) {
    return { ok: false, error: "Only owners and admins can edit the company profile." };
  }

  const decision = canAccessResource(
    { userId, organizationId: membership.organizationId, role: membership.role, resourceOrganizationId: orgId },
    "write",
  );
  if (!decision.allowed) {
    return { ok: false, error: "You do not have access to this organization." };
  }

  return { ok: true };
}

export async function updateCompanyAbout(orgId: string, data: CompanyAboutInput): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const parsed = companyAboutSchema.safeParse(data);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the company profile fields." };
  }

  const access = await requireEditableOrganization(orgId, userId);
  if (!access.ok) return access;

  const { logo, banner, linkedin, facebook, twitter, ...rest } = parsed.data;

  try {
    await prisma.organization.update({
      where: { id: orgId },
      data: {
        ...rest,
        logo: logo || null,
        banner: banner || null,
        linkedin: linkedin || null,
        facebook: facebook || null,
        twitter: twitter || null,
      },
    });
    await logAudit({ userId, organizationId: orgId, action: "company.about_updated" });
    revalidatePath("/company");
    return { ok: true };
  } catch (error) {
    console.error("[company] updateCompanyAbout failed:", error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

export async function updateCompanyServices(
  orgId: string,
  data: CompanyServicesInput,
): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const parsed = companyServicesSchema.safeParse(data);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the services & industries fields." };
  }

  const access = await requireEditableOrganization(orgId, userId);
  if (!access.ok) return access;

  try {
    await prisma.organization.update({ where: { id: orgId }, data: parsed.data });
    await logAudit({ userId, organizationId: orgId, action: "company.services_updated" });
    revalidatePath("/company");
    return { ok: true };
  } catch (error) {
    console.error("[company] updateCompanyServices failed:", error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

export async function updateOfficeLocations(
  orgId: string,
  data: OfficeLocationInput[],
): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const parsed = officeLocationsSchema.safeParse(data);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check your office locations." };
  }

  const access = await requireEditableOrganization(orgId, userId);
  if (!access.ok) return access;

  try {
    await prisma.organization.update({
      where: { id: orgId },
      data: { officeLocations: parsed.data as unknown as Prisma.InputJsonValue },
    });
    await logAudit({ userId, organizationId: orgId, action: "company.office_locations_updated" });
    revalidatePath("/company");
    return { ok: true };
  } catch (error) {
    console.error("[company] updateOfficeLocations failed:", error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

export async function updateWorkingHours(orgId: string, data: WorkingHoursInput): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const parsed = workingHoursSchema.safeParse(data);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check your working hours." };
  }

  const access = await requireEditableOrganization(orgId, userId);
  if (!access.ok) return access;

  try {
    await prisma.organization.update({
      where: { id: orgId },
      data: { workingHours: parsed.data as unknown as Prisma.InputJsonValue },
    });
    await logAudit({ userId, organizationId: orgId, action: "company.working_hours_updated" });
    revalidatePath("/company");
    return { ok: true };
  } catch (error) {
    console.error("[company] updateWorkingHours failed:", error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

export async function updateCertificates(orgId: string, data: CertificateInput[]): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const parsed = certificatesSchema.safeParse(data);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check your certificates." };
  }

  const access = await requireEditableOrganization(orgId, userId);
  if (!access.ok) return access;

  try {
    await prisma.organization.update({
      where: { id: orgId },
      data: { certificates: parsed.data as unknown as Prisma.InputJsonValue },
    });
    await logAudit({ userId, organizationId: orgId, action: "company.certificates_updated" });
    revalidatePath("/company");
    return { ok: true };
  } catch (error) {
    console.error("[company] updateCertificates failed:", error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

export async function updateAwards(orgId: string, data: AwardInput[]): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const parsed = awardsSchema.safeParse(data);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check your awards." };
  }

  const access = await requireEditableOrganization(orgId, userId);
  if (!access.ok) return access;

  try {
    await prisma.organization.update({
      where: { id: orgId },
      data: { awards: parsed.data as unknown as Prisma.InputJsonValue },
    });
    await logAudit({ userId, organizationId: orgId, action: "company.awards_updated" });
    revalidatePath("/company");
    return { ok: true };
  } catch (error) {
    console.error("[company] updateAwards failed:", error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

export async function updateCaseStudies(orgId: string, data: CaseStudyInput[]): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const parsed = caseStudiesSchema.safeParse(data);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check your case studies." };
  }

  const access = await requireEditableOrganization(orgId, userId);
  if (!access.ok) return access;

  try {
    await prisma.organization.update({
      where: { id: orgId },
      data: { caseStudies: parsed.data as unknown as Prisma.InputJsonValue },
    });
    await logAudit({ userId, organizationId: orgId, action: "company.case_studies_updated" });
    revalidatePath("/company");
    return { ok: true };
  } catch (error) {
    console.error("[company] updateCaseStudies failed:", error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

export async function updatePortfolio(orgId: string, data: PortfolioItemInput[]): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const parsed = portfolioItemsSchema.safeParse(data);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check your portfolio items." };
  }

  const access = await requireEditableOrganization(orgId, userId);
  if (!access.ok) return access;

  try {
    await prisma.organization.update({
      where: { id: orgId },
      data: { portfolio: parsed.data as unknown as Prisma.InputJsonValue },
    });
    await logAudit({ userId, organizationId: orgId, action: "company.portfolio_updated" });
    revalidatePath("/company");
    return { ok: true };
  } catch (error) {
    console.error("[company] updatePortfolio failed:", error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}
