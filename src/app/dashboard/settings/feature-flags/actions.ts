"use server";

import { z } from "zod";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isPlatformOwner } from "@/lib/billing/platform-admin";
import { logAudit } from "@/lib/audit";

/**
 * Every mutation in this file is platform-operator-only (the global
 * FeatureFlag registry and per-organization overrides are cross-tenant
 * concerns, distinct from an org's own read-only feature view) — mirrors
 * requirePlatformOwner's userId check but throws rather than redirecting,
 * since these are Server Actions invoked from client-side forms, not page
 * loads.
 */
async function requireOperator(): Promise<{ userId: string }> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) throw new Error("You must be signed in.");
  const isOwner = await isPlatformOwner(userId);
  if (!isOwner) throw new Error("Only platform operators can manage the feature-flag registry.");
  return { userId };
}

export interface FlagActionResult {
  ok: boolean;
  error?: string;
}

const createFlagSchema = z.object({
  key: z
    .string()
    .trim()
    .min(1, "A key is required.")
    .max(64)
    .regex(/^[a-z0-9_]+$/, "Use lowercase letters, numbers, and underscores only."),
  name: z.string().trim().min(1, "A name is required.").max(120),
  description: z.string().trim().max(500).optional(),
  defaultEnabled: z.boolean(),
});

export type CreateFeatureFlagInput = z.infer<typeof createFlagSchema>;

/** Real global FeatureFlag registry row creation — key must be unique across the whole platform. */
export async function createFeatureFlagAction(input: CreateFeatureFlagInput): Promise<FlagActionResult> {
  const { userId } = await requireOperator();
  const parsed = createFlagSchema.parse(input);

  const existing = await prisma.featureFlag.findUnique({ where: { key: parsed.key } });
  if (existing) return { ok: false, error: `A feature flag with key "${parsed.key}" already exists.` };

  await prisma.featureFlag.create({
    data: { key: parsed.key, name: parsed.name, description: parsed.description || null, defaultEnabled: parsed.defaultEnabled },
  });

  await logAudit({ userId, action: "feature_flag.created", metadata: { key: parsed.key } });
  return { ok: true };
}

const updateFlagSchema = z.object({
  name: z.string().trim().min(1, "A name is required.").max(120),
  description: z.string().trim().max(500).optional(),
  defaultEnabled: z.boolean(),
});

export type UpdateFeatureFlagInput = z.infer<typeof updateFlagSchema>;

/** Real edit of an existing global FeatureFlag's display metadata + default — the `key` itself is immutable once created (it's the join key every Plan/override resolves against). */
export async function updateFeatureFlagAction(id: string, input: UpdateFeatureFlagInput): Promise<FlagActionResult> {
  const { userId } = await requireOperator();
  const flagId = z.string().trim().min(1).parse(id);
  const parsed = updateFlagSchema.parse(input);

  const flag = await prisma.featureFlag.update({
    where: { id: flagId },
    data: { name: parsed.name, description: parsed.description || null, defaultEnabled: parsed.defaultEnabled },
  });

  await logAudit({ userId, action: "feature_flag.updated", metadata: { key: flag.key } });
  return { ok: true };
}

export interface OrgSearchResult {
  id: string;
  name: string;
}

/** Real Organization search by name (case-insensitive substring), for the per-org override manager to find the org to override. */
export async function searchOrganizationsAction(query: string): Promise<OrgSearchResult[]> {
  await requireOperator();
  const q = z.string().trim().min(1).max(200).parse(query);

  return prisma.organization.findMany({
    where: { name: { contains: q, mode: "insensitive" } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
    take: 10,
  });
}

export interface OrgFlagOverrideRow {
  flagId: string;
  key: string;
  name: string;
  /** null = no OrganizationFeatureOverride row for this org/flag pair (resolves via Plan/default instead). */
  overrideEnabled: boolean | null;
}

/** Every registered FeatureFlag, joined against this one org's real OrganizationFeatureOverride rows (if any). */
export async function getOrgFeatureOverridesAction(organizationId: string): Promise<OrgFlagOverrideRow[]> {
  await requireOperator();
  const orgId = z.string().trim().min(1).parse(organizationId);

  const [flags, overrides] = await Promise.all([
    prisma.featureFlag.findMany({ orderBy: { key: "asc" } }),
    prisma.organizationFeatureOverride.findMany({ where: { organizationId: orgId } }),
  ]);

  const overrideByFlagId = new Map(overrides.map((o) => [o.featureFlagId, o]));
  return flags.map((flag) => ({
    flagId: flag.id,
    key: flag.key,
    name: flag.name,
    overrideEnabled: overrideByFlagId.get(flag.id)?.enabled ?? null,
  }));
}

/** Real upsert of one OrganizationFeatureOverride row — always wins over that org's Plan/default resolution once set. */
export async function setOrgFeatureOverrideAction(organizationId: string, featureFlagId: string, enabled: boolean): Promise<FlagActionResult> {
  const { userId } = await requireOperator();
  const orgId = z.string().trim().min(1).parse(organizationId);
  const flagId = z.string().trim().min(1).parse(featureFlagId);

  await prisma.organizationFeatureOverride.upsert({
    where: { organizationId_featureFlagId: { organizationId: orgId, featureFlagId: flagId } },
    create: { organizationId: orgId, featureFlagId: flagId, enabled },
    update: { enabled },
  });

  await logAudit({ userId, organizationId: orgId, action: "feature_flag.override_set", metadata: { featureFlagId: flagId, enabled } });
  return { ok: true };
}

/** Removes this org's override for one flag, falling back to its Plan/default resolution again. */
export async function clearOrgFeatureOverrideAction(organizationId: string, featureFlagId: string): Promise<FlagActionResult> {
  const { userId } = await requireOperator();
  const orgId = z.string().trim().min(1).parse(organizationId);
  const flagId = z.string().trim().min(1).parse(featureFlagId);

  await prisma.organizationFeatureOverride.deleteMany({ where: { organizationId: orgId, featureFlagId: flagId } });

  await logAudit({ userId, organizationId: orgId, action: "feature_flag.override_cleared", metadata: { featureFlagId: flagId } });
  return { ok: true };
}
