import { prisma } from "@/lib/prisma";
import type { Company, CompanySource, CompanyStatus } from "@/generated/prisma/client";

/**
 * Strips protocol/www/path down to a bare lowercase hostname — the real,
 * comparable identity of a website URL for dedup matching. Returns null for
 * anything that doesn't parse as a URL, so callers fall back to name matching.
 */
export function normalizeWebsiteHost(website: string | null | undefined): string | null {
  if (!website) return null;
  const trimmed = website.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    return url.hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }
}

export interface FindOrCreateCompanyInput {
  organizationId: string;
  name: string;
  website?: string | null;
  industry?: string | null;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
  source: CompanySource;
  status: CompanyStatus;
}

export interface FindOrCreateCompanyResult {
  company: Company;
  wasCreated: boolean;
}

/**
 * The single choke point every "a discovered company might already exist"
 * write path (manual Lead Finder/Client Finder saves, the autonomous
 * discovery job) goes through. Matches by normalized website hostname first
 * (the strongest real-world identity signal), falling back to a
 * case-insensitive exact name match within the same organization. Neither
 * check existed anywhere before this — every prior save path called
 * `prisma.company.create()` unconditionally, so re-running the same search
 * (or Lead Finder and Client Finder both finding the same company) created
 * duplicate `Company` rows.
 */
export async function findOrCreateCompany(input: FindOrCreateCompanyInput): Promise<FindOrCreateCompanyResult> {
  const normalizedHost = normalizeWebsiteHost(input.website);

  if (normalizedHost) {
    const candidates = await prisma.company.findMany({
      where: { organizationId: input.organizationId, website: { not: null } },
      select: { id: true, website: true },
    });
    const match = candidates.find((c) => normalizeWebsiteHost(c.website) === normalizedHost);
    if (match) {
      const company = await prisma.company.findUniqueOrThrow({ where: { id: match.id } });
      return { company, wasCreated: false };
    }
  }

  const nameMatch = await prisma.company.findFirst({
    where: { organizationId: input.organizationId, name: { equals: input.name, mode: "insensitive" } },
  });
  if (nameMatch) return { company: nameMatch, wasCreated: false };

  const company = await prisma.company.create({
    data: {
      organizationId: input.organizationId,
      name: input.name,
      website: input.website || null,
      industry: input.industry || null,
      email: input.email || null,
      phone: input.phone || null,
      notes: input.notes || null,
      source: input.source,
      status: input.status,
    },
  });
  return { company, wasCreated: true };
}
