import { prisma } from "@/lib/prisma";
import { encryptSecret, decryptSecret } from "./crypto";
import type { SecretCategory } from "@/generated/prisma/client";

export interface SecretMetadata {
  id: string;
  key: string;
  category: SecretCategory;
  description: string | null;
  lastRotatedAt: Date | null;
  lastUsedAt: Date | null;
  createdAt: Date;
}

/**
 * Creates a new secret, or rotates (overwrites) an existing one with the
 * same [organizationId, key]. Rotation stamps lastRotatedAt — a fresh
 * create does not, since a value that's never been rotated has no
 * meaningful "last rotated" moment yet.
 */
export async function setSecret(
  organizationId: string,
  key: string,
  plaintext: string,
  category: SecretCategory,
  description?: string,
  userId?: string,
): Promise<void> {
  const encryptedValue = encryptSecret(plaintext);
  const existing = await prisma.secret.findUnique({
    where: { organizationId_key: { organizationId, key } },
    select: { id: true },
  });

  await prisma.secret.upsert({
    where: { organizationId_key: { organizationId, key } },
    create: {
      organizationId,
      key,
      category,
      encryptedValue,
      description: description ?? null,
      createdByUserId: userId ?? null,
    },
    update: {
      category,
      encryptedValue,
      description: description ?? null,
      lastRotatedAt: existing ? new Date() : undefined,
    },
  });
}

/**
 * Decrypts and returns a secret's plaintext value. For use INSIDE Server
 * Actions / job workers only (e.g. the workflow execution engine resolving
 * a CUSTOM_API/WEBHOOK node's credential) — never call this from
 * UI-facing code, and never pass its return value to a Client Component
 * prop, console.log, or Server Action return value.
 */
export async function getSecret(organizationId: string, key: string): Promise<string | null> {
  const row = await prisma.secret.findUnique({
    where: { organizationId_key: { organizationId, key } },
  });
  if (!row) return null;

  await prisma.secret.update({
    where: { id: row.id },
    data: { lastUsedAt: new Date() },
  });

  return decryptSecret(row.encryptedValue);
}

/**
 * Metadata-only listing for any UI/list view — deliberately never selects
 * encryptedValue, so a secret's value is structurally impossible to leak
 * through this function.
 */
export async function listSecretMetadata(organizationId: string): Promise<SecretMetadata[]> {
  return prisma.secret.findMany({
    where: { organizationId },
    select: {
      id: true,
      key: true,
      category: true,
      description: true,
      lastRotatedAt: true,
      lastUsedAt: true,
      createdAt: true,
    },
    orderBy: { key: "asc" },
  });
}

export async function deleteSecret(organizationId: string, id: string): Promise<void> {
  await prisma.secret.deleteMany({ where: { id, organizationId } });
}
