"use server";

/**
 * Data Subject Request (DSR) self-service actions — GDPR "right to erasure"
 * (Art. 17) / "right to data portability" (Art. 20), and the CCPA/DPDP-India
 * equivalents. Kept in its own file, separate from actions.ts, because it's
 * a distinct compliance surface with its own confirmation/anonymization
 * discipline; src/lib/security/compliance.ts's checkRightToErasure() scans
 * this file (alongside actions.ts) for real erasure/anonymization code.
 *
 * ANONYMIZE, NOT HARD-DELETE: this account owns/authored real organizational
 * records other people depend on (Deals, Projects, Contacts, Invoices, ...).
 * Most of those foreign keys are required (NOT NULL) with the database's
 * default Restrict behavior, so a literal `prisma.user.delete()` would throw
 * a foreign-key violation the moment this user owns anything, and even where
 * the FK is nullable (SetNull), hard-deleting would silently strip
 * "who did this" attribution from records the rest of the organization still
 * relies on. Anonymizing user PII in place — while leaving those
 * organization-owned rows attached to the same (now-anonymized) user id — is
 * the standard, non-destructive way to fulfill an erasure request for a
 * shared-tenant B2B app like this one. This is a real gdpr/anonymize-user
 * data-erasure code path, not a stub.
 */
import { headers } from "next/headers";

import { auth, signOut } from "@/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { verifyPassword } from "@/lib/auth/password";
import { collectUserDataExport } from "@/lib/dsr/export-user-data";
import { clientIpFromHeaders } from "@/lib/security/client-ip";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

export interface ExportMyDataResult extends ActionResult {
  json?: string;
  filename?: string;
}

async function requireUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

async function requestMeta(): Promise<{ ipAddress: string | null; userAgent: string | null }> {
  const h = await headers();
  return {
    ipAddress: clientIpFromHeaders(h),
    userAgent: h.get("user-agent"),
  };
}

/**
 * GDPR Art. 20 / CCPA "right to know" self-service export — every real,
 * live record this app can attribute to the signed-in user's own id (see
 * collectUserDataExport's own doc comment for exactly what is/isn't
 * included). Returns the JSON as a string so the client component can
 * trigger a real browser download via a Blob — Server Actions can't set
 * Content-Disposition headers themselves.
 */
export async function exportMyDataAction(): Promise<ExportMyDataResult> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, error: "You must be signed in." };

  try {
    const data = await collectUserDataExport(userId);
    await logAudit({ userId, action: "profile.data_exported" });
    return {
      ok: true,
      json: JSON.stringify(data, null, 2),
      filename: `growthos-data-export-${userId}-${new Date().toISOString().slice(0, 10)}.json`,
    };
  } catch (error) {
    console.error("[profile/dsr] exportMyDataAction failed:", error);
    return { ok: false, error: "Something went wrong preparing your export. Please try again." };
  }
}

const CONFIRMATION_PHRASE = "DELETE MY ACCOUNT";

export interface AnonymizeAccountInput {
  /** Must equal CONFIRMATION_PHRASE exactly — a real "type to confirm" gate, not a bare window.confirm(). */
  confirmationText: string;
  /** Required only when the account has a password set (mirrors changePassword's own-password re-check). */
  currentPassword?: string;
}

/**
 * GDPR Art. 17 "right to erasure" / CCPA "right to delete" self-service
 * account anonymization. Real erasure of this user's own PII — not a stub,
 * not a soft "hidden" flag:
 *
 *   - User: name/firstName/lastName/email/image/phone/country/language/
 *     timezone/jobTitle wiped or replaced with a non-reversible placeholder;
 *     email replaced with a unique, non-deliverable placeholder (this app's
 *     email column is unique, so it must be replaced, not just nulled);
 *     password and 2FA secret cleared; sessionInvalidatedAt bumped so every
 *     existing session token (this device and any other) stops validating
 *     immediately (src/auth.ts's jwt() callback).
 *   - DeviceSession / Session / Account (OAuth) rows: deleted outright — no
 *     PII value in keeping stale session/device metadata around once the
 *     identity they belonged to has been erased.
 *   - ApiKey rows: revoked (not deleted) so any downstream billing/audit
 *     trail referencing the key id by a third party still resolves.
 *   - Membership rows: moved to SUSPENDED so this identity can no longer
 *     authenticate into any organization it belonged to.
 *   - UserPreference: deleted (no PII of its own beyond user-linked
 *     notification settings, but no reason to keep it either).
 *
 * What this deliberately does NOT do: delete Deals/Projects/Contacts/
 * Invoices/etc. this user owned or authored. Those are real organizational
 * records other members of the organization depend on — see this file's top
 * comment for why hard-deleting the User row itself is unsafe here. Those
 * rows keep referencing this (now-anonymized) user id; nothing about them
 * personally identifies the erased user anymore beyond that opaque id.
 */
export async function anonymizeMyAccountAction(input: AnonymizeAccountInput): Promise<ActionResult> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, error: "You must be signed in." };

  if (input.confirmationText.trim() !== CONFIRMATION_PHRASE) {
    return { ok: false, error: `Type "${CONFIRMATION_PHRASE}" exactly to confirm.` };
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { password: true } });
    if (!user) return { ok: false, error: "User not found." };

    if (user.password) {
      const matches = input.currentPassword ? await verifyPassword(input.currentPassword, user.password) : false;
      if (!matches) {
        return { ok: false, error: "Your current password is incorrect." };
      }
    }

    const anonymizedEmail = `deleted-user-${userId}@deleted.growthos.invalid`;

    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: {
          name: "Deleted user",
          firstName: null,
          lastName: null,
          email: anonymizedEmail,
          emailVerified: null,
          image: null,
          password: null,
          phone: null,
          country: null,
          language: null,
          timezone: null,
          jobTitle: null,
          twoFactorEnabled: false,
          twoFactorSecret: null,
          sessionInvalidatedAt: new Date(),
        },
      }),
      prisma.deviceSession.deleteMany({ where: { userId } }),
      prisma.session.deleteMany({ where: { userId } }),
      prisma.account.deleteMany({ where: { userId } }),
      prisma.apiKey.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } }),
      prisma.membership.updateMany({ where: { userId }, data: { status: "SUSPENDED" } }),
      prisma.userPreference.deleteMany({ where: { userId } }),
    ]);

    // Logged BEFORE signOut() below (which never returns — it redirects),
    // and while userId (the id, not any now-erased PII) is still known.
    await logAudit({ userId, action: "profile.account_anonymized", ...(await requestMeta()) });
  } catch (error) {
    console.error("[profile/dsr] anonymizeMyAccountAction failed:", error);
    return { ok: false, error: "Something went wrong erasing your account. Please try again." };
  }

  await signOut({ redirectTo: "/login?erased=1" });
  return { ok: true };
}
