import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { WhiteLabelPackManifest } from "../manifest-schema";

/**
 * Read-merge-write into WhiteLabelSettings.templateOverrides — never a
 * blind overwrite of an org's existing customizations. Bypasses the strict
 * user-facing upsertWhiteLabelSettingsSchema (that schema validates brand
 * fields a human fills in on a form; this is a narrower, additive Json
 * merge of a different field).
 */
export async function installWhiteLabelPack(organizationId: string, manifest: WhiteLabelPackManifest): Promise<{ whiteLabelSettingsId: string }> {
  const existing = await prisma.whiteLabelSettings.findUnique({ where: { organizationId } });
  const existingOverrides = (existing?.templateOverrides as Record<string, unknown> | null) ?? {};
  const merged = { ...existingOverrides, ...manifest.templateOverrides };

  const settings = await prisma.whiteLabelSettings.upsert({
    where: { organizationId },
    create: { organizationId, templateOverrides: merged as unknown as Prisma.InputJsonValue },
    update: { templateOverrides: merged as unknown as Prisma.InputJsonValue },
  });

  return { whiteLabelSettingsId: settings.id };
}

/** Removes only the keys this pack added, leaving any other real customization untouched. */
export async function uninstallWhiteLabelPack(organizationId: string, manifest: WhiteLabelPackManifest): Promise<void> {
  const existing = await prisma.whiteLabelSettings.findUnique({ where: { organizationId } });
  if (!existing) return;
  const existingOverrides = { ...((existing.templateOverrides as Record<string, unknown> | null) ?? {}) };
  for (const key of Object.keys(manifest.templateOverrides)) delete existingOverrides[key];
  await prisma.whiteLabelSettings.update({ where: { organizationId }, data: { templateOverrides: existingOverrides as unknown as Prisma.InputJsonValue } });
}
