import { randomBytes } from "node:crypto";

import { prisma } from "@/lib/prisma";
import type { License, LicenseType } from "@/generated/prisma/client";

/**
 * License Management (Phase 18). A License is a real, org-scoped credential
 * an external system (an API integration, an on-prem SEAT install, an
 * ENTERPRISE deployment) presents to prove it's allowed to operate against
 * this organization's account. Every mutation here reads/writes the real
 * `License` row in prisma/schema.prisma — no in-memory or mocked state.
 */

// Excludes visually ambiguous characters (0/O, 1/I/L) so a human re-typing a
// key from a screen or a support ticket doesn't second-guess a character.
const KEY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomSegment(length: number): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += KEY_ALPHABET[bytes[i] % KEY_ALPHABET.length];
  }
  return out;
}

function formatLicenseKey(): string {
  return `GOS-${randomSegment(4)}-${randomSegment(4)}-${randomSegment(4)}-${randomSegment(4)}`;
}

/** Generates a real, DB-unique license key — retries on collision (astronomically unlikely at this key space) rather than ever reusing/faking one. */
async function generateUniqueLicenseKey(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = formatLicenseKey();
    const existing = await prisma.license.findUnique({ where: { key: candidate }, select: { id: true } });
    if (!existing) return candidate;
  }
  throw new Error("Could not generate a unique license key. Please try again.");
}

/**
 * Issues a new License for `organizationId`. Requires the organization to
 * already have a real BillingAccount (a License always ties back to one) —
 * throws rather than silently creating an orphaned license if it doesn't.
 */
export async function generateLicenseKey(
  organizationId: string,
  type: LicenseType,
  seats?: number,
  expiresAt?: Date,
): Promise<License> {
  const billingAccount = await prisma.billingAccount.findUnique({
    where: { organizationId },
    select: { id: true },
  });
  if (!billingAccount) {
    throw new Error("This organization has no billing account yet — set up billing before issuing a license.");
  }

  const key = await generateUniqueLicenseKey();

  return prisma.license.create({
    data: {
      organizationId,
      billingAccountId: billingAccount.id,
      type,
      key,
      seats: seats ?? undefined,
      expiresAt: expiresAt ?? undefined,
    },
  });
}

/**
 * Activates a license key on first real use — sets `activatedAt` the first
 * time only (idempotent on repeat calls) and always stamps `lastVerifiedAt`.
 * Lazily flips a genuinely expired ACTIVE license to EXPIRED rather than
 * leaving a stale status sitting in the row.
 */
export async function activateLicense(key: string): Promise<{ ok: boolean; error?: string }> {
  const license = await prisma.license.findUnique({ where: { key } });
  if (!license) return { ok: false, error: "License key not found." };
  if (license.status === "REVOKED") return { ok: false, error: "This license has been revoked." };

  const now = new Date();
  if (license.expiresAt && license.expiresAt < now) {
    if (license.status !== "EXPIRED") {
      await prisma.license.update({ where: { id: license.id }, data: { status: "EXPIRED" } });
    }
    return { ok: false, error: "This license has expired." };
  }

  if (license.status !== "ACTIVE") {
    return { ok: false, error: "This license is not active." };
  }

  await prisma.license.update({
    where: { id: license.id },
    data: {
      activatedAt: license.activatedAt ?? now,
      lastVerifiedAt: now,
    },
  });

  return { ok: true };
}

/**
 * The real check an external API consumer calls before granting access on
 * every request (or on some cached interval) — exists: status ACTIVE, not
 * past `expiresAt`. Stamps `lastVerifiedAt` on every real valid check so
 * "when did we last see this license used" is always accurate. Lazily
 * flips a genuinely expired ACTIVE license to EXPIRED, same as
 * activateLicense.
 */
export async function verifyLicense(
  key: string,
): Promise<{ valid: boolean; reason?: string; license?: License }> {
  const license = await prisma.license.findUnique({ where: { key } });
  if (!license) return { valid: false, reason: "License key not found." };

  if (license.status === "REVOKED") {
    return { valid: false, reason: "License has been revoked.", license };
  }

  const now = new Date();
  if (license.expiresAt && license.expiresAt < now) {
    const expired =
      license.status === "EXPIRED"
        ? license
        : await prisma.license.update({ where: { id: license.id }, data: { status: "EXPIRED" } });
    return { valid: false, reason: "License has expired.", license: expired };
  }

  if (license.status !== "ACTIVE") {
    return { valid: false, reason: "License is not active.", license };
  }

  const updated = await prisma.license.update({ where: { id: license.id }, data: { lastVerifiedAt: now } });
  return { valid: true, license: updated };
}

/** Org-scoped revoke — only ever flips status to REVOKED, never deletes the row (the license's history stays real and auditable). Throws if the license doesn't belong to `organizationId`, so a caller can't revoke another org's license by guessing an id. */
export async function revokeLicense(licenseId: string, organizationId: string): Promise<void> {
  const result = await prisma.license.updateMany({
    where: { id: licenseId, organizationId },
    data: { status: "REVOKED" },
  });
  if (result.count === 0) {
    throw new Error("License not found for this organization.");
  }
}
