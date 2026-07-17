import { prisma } from "@/lib/prisma";
import type { LeadDiscoveryConfig, OutreachAutoMode } from "@/generated/prisma/client";

/**
 * Every org gets a config row lazily, defaulting `discoveryEnabled: false` —
 * the autonomous system never runs for an org until an OWNER/ADMIN
 * explicitly opts in (creates real CRM data + spends real AI credits
 * unattended, so opt-in is the only safe default).
 */
export async function getOrCreateDiscoveryConfig(organizationId: string): Promise<LeadDiscoveryConfig> {
  const existing = await prisma.leadDiscoveryConfig.findUnique({ where: { organizationId } });
  if (existing) return existing;

  try {
    return await prisma.leadDiscoveryConfig.create({ data: { organizationId } });
  } catch (error) {
    const isUniqueViolation = typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
    if (isUniqueViolation) {
      return prisma.leadDiscoveryConfig.findUniqueOrThrow({ where: { organizationId } });
    }
    throw error;
  }
}

export interface UpdateDiscoveryConfigInput {
  discoveryEnabled?: boolean;
  searchQueries?: string[];
  scoringWeights?: Record<string, number> | null;
  outreachAutoMode?: OutreachAutoMode;
  updatedByUserId: string;
}

export async function updateDiscoveryConfig(organizationId: string, input: UpdateDiscoveryConfigInput): Promise<LeadDiscoveryConfig> {
  await getOrCreateDiscoveryConfig(organizationId);
  return prisma.leadDiscoveryConfig.update({
    where: { organizationId },
    data: {
      ...(input.discoveryEnabled !== undefined ? { discoveryEnabled: input.discoveryEnabled } : {}),
      ...(input.searchQueries !== undefined ? { searchQueries: input.searchQueries } : {}),
      ...(input.scoringWeights !== undefined ? { scoringWeights: input.scoringWeights ?? undefined } : {}),
      ...(input.outreachAutoMode !== undefined ? { outreachAutoMode: input.outreachAutoMode } : {}),
      updatedByUserId: input.updatedByUserId,
    },
  });
}

/**
 * Default queries derived from the org's own real profile when no
 * `searchQueries` are configured — never a hardcoded generic query. Returns
 * an empty array (never a fake query) if the org hasn't filled in enough
 * profile data to derive anything meaningful.
 */
export function deriveDefaultQueries(organization: { industry: string | null; clientTypes: string[]; countriesServed: string[] }): string[] {
  if (!organization.industry && organization.clientTypes.length === 0) return [];

  const country = organization.countriesServed[0];
  const base = organization.industry ?? organization.clientTypes[0];
  if (!base) return [];

  return [country ? `${base} companies in ${country}` : `${base} companies`];
}
