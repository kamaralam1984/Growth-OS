"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { generateSecret, generateURI, verify } from "otplib";
import QRCode from "qrcode";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { auth, signOut } from "@/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { logSecurityEvent } from "@/lib/security/security-events";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import {
  personalInfoSchema,
  changePasswordSchema,
  twoFactorConfirmSchema,
  notificationPreferencesSchema,
  userPreferencesSchema,
  toggleAgentActiveSchema,
  type PersonalInfoInput,
  type ChangePasswordInput,
  type TwoFactorConfirmInput,
  type NotificationPreferencesInput,
  type UserPreferencesInput,
  type ToggleAgentActiveInput,
} from "@/lib/validations/profile";
import { createApiKeySchema } from "@/lib/validations/api-keys";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

async function requireUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

/**
 * Best-effort request metadata for SecurityEvent rows written from Server
 * Actions below — mirrors the `x-forwarded-for`-first, `x-real-ip`-fallback
 * convention already used by `clientIp()` in src/auth.ts. Server Actions
 * have no `Request` object of their own, so this reads the same inbound
 * headers via `next/headers` instead.
 */
async function requestMeta(): Promise<{ ipAddress: string | null; userAgent: string | null }> {
  const h = await headers();
  const forwardedFor = h.get("x-forwarded-for");
  return {
    ipAddress: forwardedFor ? (forwardedFor.split(",")[0]?.trim() ?? null) : h.get("x-real-ip"),
    userAgent: h.get("user-agent"),
  };
}

export async function updatePersonalInfo(data: PersonalInfoInput): Promise<ActionResult> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, error: "You must be signed in." };

  const parsed = personalInfoSchema.safeParse(data);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check your details." };
  }

  const { firstName, lastName, phone, country, language, timezone, jobTitle, image } = parsed.data;

  try {
    await prisma.user.update({
      where: { id: userId },
      data: {
        firstName,
        lastName,
        name: `${firstName} ${lastName}`.trim(),
        phone: phone || null,
        country: country || null,
        language: language || null,
        timezone: timezone || null,
        jobTitle: jobTitle || null,
        image: image || null,
      },
    });
    revalidatePath("/profile");
    return { ok: true };
  } catch (error) {
    console.error("[profile] updatePersonalInfo failed:", error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

export async function changePassword(data: ChangePasswordInput): Promise<ActionResult> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, error: "You must be signed in." };

  const parsed = changePasswordSchema.safeParse(data);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check your password fields." };
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { password: true } });
    if (!user) return { ok: false, error: "User not found." };

    if (user.password) {
      const currentPassword = parsed.data.currentPassword ?? "";
      const matches = currentPassword ? await verifyPassword(currentPassword, user.password) : false;
      if (!matches) {
        return { ok: false, error: "Current password is incorrect." };
      }
    }

    const hashed = await hashPassword(parsed.data.newPassword);
    await prisma.user.update({ where: { id: userId }, data: { password: hashed } });
    await logAudit({ userId, action: "profile.password_changed" });
    void logSecurityEvent({ userId, type: "PASSWORD_CHANGED", severity: "INFO", ...(await requestMeta()) });
    revalidatePath("/profile");
    return { ok: true };
  } catch (error) {
    console.error("[profile] changePassword failed:", error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

export interface StartTwoFactorResult extends ActionResult {
  secret?: string;
  qrCodeDataUrl?: string;
}

/**
 * Generates a new TOTP secret, persists it to User.twoFactorSecret
 * (twoFactorEnabled stays false until confirmTwoFactorEnrollment succeeds),
 * and returns a QR code data URI for scanning plus the raw secret for manual
 * entry. Safe to call again before confirming — it simply replaces the
 * pending secret.
 */
export async function startTwoFactorEnrollment(): Promise<StartTwoFactorResult> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, error: "You must be signed in." };

  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    if (!user) return { ok: false, error: "User not found." };

    const secret = generateSecret();
    const otpauthUrl = generateURI({
      issuer: "KVL GrowthOS",
      label: user.email ?? userId,
      secret,
    });
    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);

    await prisma.user.update({ where: { id: userId }, data: { twoFactorSecret: secret } });

    return { ok: true, secret, qrCodeDataUrl };
  } catch (error) {
    console.error("[profile] startTwoFactorEnrollment failed:", error);
    return { ok: false, error: "Could not start 2FA setup. Please try again." };
  }
}

export async function confirmTwoFactorEnrollment(data: TwoFactorConfirmInput): Promise<ActionResult> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, error: "You must be signed in." };

  const parsed = twoFactorConfirmSchema.safeParse(data);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Enter a valid 6-digit code." };
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { twoFactorSecret: true } });
    if (!user?.twoFactorSecret) {
      return { ok: false, error: "Start 2FA setup first." };
    }

    // 30s tolerance each way (one time-step) to absorb clock drift between
    // the user's authenticator app and this server.
    const result = await verify({ secret: user.twoFactorSecret, token: parsed.data.code, epochTolerance: 30 });
    if (!result.valid) {
      return { ok: false, error: "That code didn't match. Please try again." };
    }

    await prisma.user.update({ where: { id: userId }, data: { twoFactorEnabled: true } });
    await logAudit({ userId, action: "profile.2fa_enabled" });
    void logSecurityEvent({ userId, type: "TWO_FACTOR_ENABLED", severity: "INFO", ...(await requestMeta()) });
    revalidatePath("/profile");
    return { ok: true };
  } catch (error) {
    console.error("[profile] confirmTwoFactorEnrollment failed:", error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

export async function disableTwoFactor(): Promise<ActionResult> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, error: "You must be signed in." };

  try {
    await prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: false, twoFactorSecret: null },
    });
    await logAudit({ userId, action: "profile.2fa_disabled" });
    void logSecurityEvent({ userId, type: "TWO_FACTOR_DISABLED", severity: "WARNING", ...(await requestMeta()) });
    revalidatePath("/profile");
    return { ok: true };
  } catch (error) {
    console.error("[profile] disableTwoFactor failed:", error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

const deviceSessionIdSchema = z.string().trim().min(1);

export async function signOutDevice(deviceSessionId: string): Promise<ActionResult> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, error: "You must be signed in." };

  const parsed = deviceSessionIdSchema.safeParse(deviceSessionId);
  if (!parsed.success) return { ok: false, error: "Invalid device." };

  try {
    const device = await prisma.deviceSession.findUnique({ where: { id: parsed.data } });
    if (!device || device.userId !== userId) {
      return { ok: false, error: "Device not found." };
    }

    await prisma.deviceSession.delete({ where: { id: parsed.data } });
    void logSecurityEvent({
      userId,
      type: "SESSION_REVOKED",
      severity: "INFO",
      detail: "single device",
      ...(await requestMeta()),
    });
    revalidatePath("/profile");
    return { ok: true };
  } catch (error) {
    console.error("[profile] signOutDevice failed:", error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

/**
 * Signs the user out of every device.
 *
 * What this actually guarantees, and what it doesn't: this app uses
 * stateless JWT sessions (session.strategy === "jwt" in src/auth.ts), so the
 * `Session` DB table below is vestigial — the Prisma adapter writes to it,
 * but it is never read to validate a request. Deleting it (and the
 * DeviceSession rows) alone would NOT force any other browser's already-issued
 * JWT to stop working; that JWT stays valid in its owner's cookie until it
 * expires on its own. The part that makes this real is bumping
 * `User.sessionInvalidatedAt` — src/auth.ts's jwt() callback compares that
 * timestamp against the token's own signedInAt claim on every request and
 * rejects any token minted before it, which is the standard way to revoke
 * stateless JWTs. DeviceSession rows are deleted so the device-list UI
 * honestly reflects that every known device has been signed out, and the
 * current browser is signed out immediately via next-auth's signOut() below.
 */
export async function signOutAllDevices(): Promise<void> {
  const userId = await requireUserId();
  if (!userId) {
    await signOut({ redirectTo: "/login" });
    return;
  }

  try {
    await prisma.$transaction([
      prisma.deviceSession.deleteMany({ where: { userId } }),
      prisma.session.deleteMany({ where: { userId } }),
      prisma.user.update({ where: { id: userId }, data: { sessionInvalidatedAt: new Date() } }),
    ]);
    await logAudit({ userId, action: "profile.signed_out_everywhere" });
    void logSecurityEvent({
      userId,
      type: "SESSION_REVOKED",
      severity: "INFO",
      detail: "all devices",
      ...(await requestMeta()),
    });
  } catch (error) {
    console.error("[profile] signOutAllDevices failed:", error);
  }

  await signOut({ redirectTo: "/login" });
}

export async function updateNotificationPreferences(
  data: NotificationPreferencesInput,
): Promise<ActionResult> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, error: "You must be signed in." };

  const parsed = notificationPreferencesSchema.safeParse(data);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check your notification settings." };
  }

  const { slackWebhookUrl, teamsWebhookUrl, ...toggles } = parsed.data;

  try {
    await prisma.userPreference.upsert({
      where: { userId },
      create: {
        userId,
        ...toggles,
        slackWebhookUrl: slackWebhookUrl || null,
        teamsWebhookUrl: teamsWebhookUrl || null,
      },
      update: {
        ...toggles,
        slackWebhookUrl: slackWebhookUrl || null,
        teamsWebhookUrl: teamsWebhookUrl || null,
      },
    });
    revalidatePath("/profile");
    return { ok: true };
  } catch (error) {
    console.error("[profile] updateNotificationPreferences failed:", error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

export async function updateUserPreferences(data: UserPreferencesInput): Promise<ActionResult> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, error: "You must be signed in." };

  const parsed = userPreferencesSchema.safeParse(data);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check your preferences." };
  }

  try {
    await prisma.userPreference.upsert({
      where: { userId },
      create: { userId, ...parsed.data },
      update: { ...parsed.data },
    });
    revalidatePath("/profile");
    return { ok: true };
  } catch (error) {
    console.error("[profile] updateUserPreferences failed:", error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

export async function toggleAgentActive(data: ToggleAgentActiveInput): Promise<ActionResult> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, error: "You must be signed in." };

  const parsed = toggleAgentActiveSchema.safeParse(data);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." };
  }

  try {
    const agent = await prisma.aIAgentInstance.findUnique({ where: { id: parsed.data.agentId } });
    if (!agent) return { ok: false, error: "Agent not found." };

    const membership = await prisma.membership.findUnique({
      where: { userId_organizationId: { userId, organizationId: agent.organizationId } },
    });
    if (!membership || membership.status !== "ACTIVE") {
      return { ok: false, error: "You do not have access to this agent." };
    }

    await prisma.aIAgentInstance.update({
      where: { id: parsed.data.agentId },
      data: { active: parsed.data.active },
    });
    revalidatePath("/profile");
    return { ok: true };
  } catch (error) {
    console.error("[profile] toggleAgentActive failed:", error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

export interface CreateApiKeyResult extends ActionResult {
  rawKey?: string;
  key?: {
    id: string;
    name: string;
    prefix: string;
    scopes: string[];
    lastUsedAt: string | null;
    revokedAt: string | null;
    createdAt: string;
  };
}

const API_KEY_PREFIX = "gos_";

/**
 * Generates a new API key for the signed-in user's active organization.
 * Only the bcrypt hash is persisted (mirrors changePassword's hashing
 * approach) — the raw key is returned exactly once and can never be
 * retrieved again, matching GitHub/Stripe-style "shown once" UX.
 *
 * `scopes` is validated against the closed API_KEY_SCOPES set and defaults
 * to no scopes at all (a key that can authenticate but is granted nothing).
 * `rateLimitPerHour` defaults to the same 1000/hr as the Prisma column
 * default — passed explicitly here so a caller can request a lower or
 * higher per-key ceiling.
 */
export async function createApiKey(name: string, scopes: string[] = [], rateLimitPerHour = 1000): Promise<CreateApiKeyResult> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, error: "You must be signed in." };

  const parsed = createApiKeySchema.safeParse({ name, scopes, rateLimitPerHour });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please enter a valid name." };
  }

  try {
    const membership = await prisma.membership.findFirst({
      where: { userId, status: "ACTIVE" },
      orderBy: { createdAt: "asc" },
    });
    if (!membership) {
      return { ok: false, error: "You do not have an active organization." };
    }

    const rawKey = `${API_KEY_PREFIX}${crypto.randomBytes(32).toString("hex")}`;
    const prefix = rawKey.slice(0, 12);
    const hashedKey = await bcrypt.hash(rawKey, 10);

    const created = await prisma.apiKey.create({
      data: {
        organizationId: membership.organizationId,
        userId,
        name: parsed.data.name,
        prefix,
        hashedKey,
        scopes: parsed.data.scopes,
      },
    });
    await logAudit({ userId, organizationId: membership.organizationId, action: "profile.api_key_created" });
    revalidatePath("/profile");
    return {
      ok: true,
      rawKey,
      key: {
        id: created.id,
        name: created.name,
        prefix: created.prefix,
        scopes: created.scopes,
        lastUsedAt: null,
        revokedAt: null,
        createdAt: created.createdAt.toISOString(),
      },
    };
  } catch (error) {
    console.error("[profile] createApiKey failed:", error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

const apiKeyIdSchema = z.string().trim().min(1);

export async function revokeApiKey(id: string): Promise<ActionResult> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, error: "You must be signed in." };

  const parsed = apiKeyIdSchema.safeParse(id);
  if (!parsed.success) return { ok: false, error: "Invalid key." };

  try {
    const apiKey = await prisma.apiKey.findUnique({ where: { id: parsed.data } });
    if (!apiKey || apiKey.userId !== userId) {
      return { ok: false, error: "Key not found." };
    }
    if (apiKey.revokedAt) {
      return { ok: false, error: "This key is already revoked." };
    }

    await prisma.apiKey.update({ where: { id: parsed.data }, data: { revokedAt: new Date() } });
    await logAudit({ userId, organizationId: apiKey.organizationId, action: "profile.api_key_revoked" });
    revalidatePath("/profile");
    return { ok: true };
  } catch (error) {
    console.error("[profile] revokeApiKey failed:", error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}
