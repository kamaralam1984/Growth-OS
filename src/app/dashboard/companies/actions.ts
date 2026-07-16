"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { logAudit } from "@/lib/audit";
import { addCompanyTimelineEvent } from "@/lib/company-intelligence";
import { scoreCompany } from "@/lib/lead-scoring";
import { geocodeAddress } from "@/lib/geo/geocode";
import { companySchema, type CompanyInput } from "@/lib/validations/company-directory";
import { Prisma } from "@/generated/prisma/client";
import { z } from "zod";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

const EDITOR_ROLES = new Set(["OWNER", "ADMIN"]);

async function resolveActiveMembership(userId: string) {
  return prisma.membership.findFirst({
    where: { userId, status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
  });
}

/** Shared field mapping for both create and update — keeps the two in sync as the profile schema grows. */
function buildProfileData(parsed: z.output<typeof companySchema>) {
  const socialLinks =
    parsed.linkedinUrl || parsed.facebookUrl || parsed.twitterUrl || parsed.instagramUrl
      ? {
          linkedin: parsed.linkedinUrl || undefined,
          facebook: parsed.facebookUrl || undefined,
          twitter: parsed.twitterUrl || undefined,
          instagram: parsed.instagramUrl || undefined,
        }
      : undefined;

  return {
    name: parsed.name,
    industry: parsed.industry || null,
    website: parsed.website || null,
    email: parsed.email || null,
    phone: parsed.phone || null,
    address: parsed.address || null,
    employeeCount: parsed.employeeCount ?? null,
    notes: parsed.notes || null,
    status: parsed.status,
    logo: parsed.logo || null,
    description: parsed.description || null,
    headquartersCountry: parsed.headquartersCountry || null,
    headquartersState: parsed.headquartersState || null,
    headquartersCity: parsed.headquartersCity || null,
    estimatedRevenue: parsed.estimatedRevenue ?? null,
    foundedYear: parsed.foundedYear ?? null,
    technologies: parsed.technologies ?? [],
    products: parsed.products ?? [],
    servicesOffered: parsed.servicesOffered ?? [],
    targetCustomers: parsed.targetCustomers || null,
    socialLinks: socialLinks ?? Prisma.JsonNull,
    googleMapsUrl: parsed.googleMapsUrl || null,
    contactFormUrl: parsed.contactFormUrl || null,
    businessType: parsed.businessType || null,
    remoteHybrid: parsed.remoteHybrid || null,
    publicPrivate: parsed.publicPrivate || null,
    growthRate: parsed.growthRate ?? null,
    fundingStage: parsed.fundingStage || null,
    fundingAmount: parsed.fundingAmount ?? null,
    language: parsed.language || null,
  };
}

export interface CreateCompanyResult extends ActionResult {
  companyId?: string;
}

/** Creates a real Company row — available to any ACTIVE member, same as Quick Actions' createLead. */
export async function createCompany(input: CompanyInput): Promise<CreateCompanyResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const parsed = companySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the company details." };
  }

  const membership = await resolveActiveMembership(userId);
  if (!membership) return { ok: false, error: "You don't belong to an organization yet." };
  const organizationId = membership.organizationId;

  let coords: { lat: number; lng: number } | null = null;
  const hqQuery = [parsed.data.headquartersCity, parsed.data.headquartersState, parsed.data.headquartersCountry]
    .filter(Boolean)
    .join(", ");
  if (hqQuery) coords = await geocodeAddress(hqQuery);

  try {
    const company = await prisma.company.create({
      data: {
        ...buildProfileData(parsed.data),
        organizationId,
        source: "MANUAL",
        latitude: coords?.lat ?? null,
        longitude: coords?.lng ?? null,
      },
    });

    await logActivity({
      organizationId,
      type: "SYSTEM_EVENT",
      description: `${session.user?.name ?? "A team member"} added ${company.name} to Companies.`,
      actorUserId: userId,
      metadata: { companyId: company.id },
    });
    await logAudit({
      userId,
      organizationId,
      action: "companies.company_created",
      metadata: { companyId: company.id },
    });
    await addCompanyTimelineEvent({
      companyId: company.id,
      type: "CREATED",
      title: `${company.name} added to Companies`,
      source: "MANUAL",
    });
    await scoreCompany(company.id);

    revalidatePath("/dashboard/companies");
    revalidatePath("/dashboard/crm");
    return { ok: true, companyId: company.id };
  } catch (error) {
    console.error("[companies] createCompany failed:", error);
    return { ok: false, error: "Something went wrong creating the company. Please try again." };
  }
}

export async function updateCompany(companyId: string, input: CompanyInput): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const parsed = companySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the company details." };
  }

  const membership = await resolveActiveMembership(userId);
  if (!membership) return { ok: false, error: "You don't belong to an organization yet." };

  try {
    const existing = await prisma.company.findUnique({ where: { id: companyId } });
    if (!existing || existing.organizationId !== membership.organizationId) {
      return { ok: false, error: "Company not found." };
    }

    let coords: { lat: number; lng: number } | null = null;
    if (existing.latitude == null || existing.longitude == null) {
      const hqQuery = [parsed.data.headquartersCity, parsed.data.headquartersState, parsed.data.headquartersCountry]
        .filter(Boolean)
        .join(", ");
      if (hqQuery) coords = await geocodeAddress(hqQuery);
    }

    await prisma.company.update({
      where: { id: companyId },
      data: {
        ...buildProfileData(parsed.data),
        ...(coords ? { latitude: coords.lat, longitude: coords.lng } : {}),
      },
    });

    await logAudit({
      userId,
      organizationId: membership.organizationId,
      action: "companies.company_updated",
      metadata: { companyId },
    });

    revalidatePath("/dashboard/companies");
    revalidatePath(`/dashboard/companies/${companyId}`);
    revalidatePath("/dashboard/crm");
    return { ok: true };
  } catch (error) {
    console.error("[companies] updateCompany failed:", error);
    return { ok: false, error: "Something went wrong updating the company. Please try again." };
  }
}

/** Deletion is restricted to OWNER/ADMIN — same bar as editing the org profile. */
export async function deleteCompany(companyId: string): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const membership = await resolveActiveMembership(userId);
  if (!membership) return { ok: false, error: "You don't belong to an organization yet." };
  if (!EDITOR_ROLES.has(membership.role)) {
    return { ok: false, error: "Only owners and admins can delete companies." };
  }

  try {
    const existing = await prisma.company.findUnique({ where: { id: companyId } });
    if (!existing || existing.organizationId !== membership.organizationId) {
      return { ok: false, error: "Company not found." };
    }

    await prisma.company.delete({ where: { id: companyId } });
    await logAudit({
      userId,
      organizationId: membership.organizationId,
      action: "companies.company_deleted",
      metadata: { companyId },
    });

    revalidatePath("/dashboard/companies");
    revalidatePath("/dashboard/crm");
    return { ok: true };
  } catch (error) {
    console.error("[companies] deleteCompany failed:", error);
    return { ok: false, error: "Something went wrong deleting the company. Please try again." };
  }
}

async function resolveCompanyInOrg(userId: string, companyId: string) {
  const membership = await resolveActiveMembership(userId);
  if (!membership) return null;
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company || company.organizationId !== membership.organizationId) return null;
  return { membership, company };
}

export interface AddToCrmResult extends ActionResult {
  leadId?: string;
  alreadyInCrm?: boolean;
}

/** One-click "Add to CRM" — creates a real Lead in the org's first pipeline stage, unless one already exists for this company. */
export async function addCompanyToCrm(companyId: string): Promise<AddToCrmResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const resolved = await resolveCompanyInOrg(userId, companyId);
  if (!resolved) return { ok: false, error: "Company not found." };

  const existingLead = await prisma.lead.findFirst({ where: { companyId } });
  if (existingLead) return { ok: true, leadId: existingLead.id, alreadyInCrm: true };

  const stage = await prisma.pipelineStage.findFirst({
    where: { workspace: { organizationId: resolved.membership.organizationId } },
    orderBy: { order: "asc" },
  });
  if (!stage) return { ok: false, error: "No pipeline stage is configured for your organization yet." };

  try {
    const lead = await prisma.lead.create({
      data: {
        pipelineStageId: stage.id,
        companyId,
        name: resolved.company.name,
        company: resolved.company.name,
        email: resolved.company.email,
        estimatedValue: resolved.company.estimatedRevenue,
      },
    });
    if (resolved.company.status === "PROSPECT") {
      await prisma.company.update({ where: { id: companyId }, data: { status: "LEAD" } });
    }
    await addCompanyTimelineEvent({
      companyId,
      type: "INTERNAL_ACTIVITY",
      title: `${resolved.company.name} added to CRM pipeline`,
      source: "MANUAL",
    });
    await logAudit({
      userId,
      organizationId: resolved.membership.organizationId,
      action: "companies.added_to_crm",
      metadata: { companyId, leadId: lead.id },
    });
    revalidatePath("/dashboard/crm");
    revalidatePath(`/dashboard/companies/${companyId}`);
    revalidatePath("/dashboard/companies");
    return { ok: true, leadId: lead.id };
  } catch (error) {
    console.error("[companies] addCompanyToCrm failed:", error);
    return { ok: false, error: "Something went wrong adding this company to the CRM. Please try again." };
  }
}

/** One-click "Assign Owner" — sets Company.ownerUserId to any active member of the org, or clears it. */
export async function assignCompanyOwner(companyId: string, ownerUserId: string | null): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const resolved = await resolveCompanyInOrg(userId, companyId);
  if (!resolved) return { ok: false, error: "Company not found." };

  if (ownerUserId) {
    const ownerMembership = await prisma.membership.findFirst({
      where: { userId: ownerUserId, organizationId: resolved.membership.organizationId, status: "ACTIVE" },
    });
    if (!ownerMembership) return { ok: false, error: "That team member could not be found." };
  }

  await prisma.company.update({ where: { id: companyId }, data: { ownerUserId } });
  await logAudit({
    userId,
    organizationId: resolved.membership.organizationId,
    action: "companies.owner_assigned",
    metadata: { companyId, ownerUserId },
  });
  revalidatePath(`/dashboard/companies/${companyId}`);
  revalidatePath("/dashboard/companies");
  return { ok: true };
}

/** One-click "Mark Priority" — sets Company.priority (reuses the existing MessagePriority enum). */
export async function markCompanyPriority(companyId: string, priority: "LOW" | "NORMAL" | "HIGH" | "URGENT"): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const resolved = await resolveCompanyInOrg(userId, companyId);
  if (!resolved) return { ok: false, error: "Company not found." };

  await prisma.company.update({ where: { id: companyId }, data: { priority } });
  await logAudit({
    userId,
    organizationId: resolved.membership.organizationId,
    action: "companies.priority_marked",
    metadata: { companyId, priority },
  });
  revalidatePath(`/dashboard/companies/${companyId}`);
  revalidatePath("/dashboard/companies");
  return { ok: true };
}
