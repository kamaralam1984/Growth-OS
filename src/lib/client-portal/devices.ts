import { cookies, headers } from "next/headers";
import { randomUUID } from "node:crypto";

import { prisma } from "@/lib/prisma";

export const DEVICE_FINGERPRINT_COOKIE = "kvl_portal_device";
const DEVICE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year — a stable per-browser identifier, not a session

/** A random id persisted in a long-lived cookie — a stable per-browser identifier for "device management," NOT real hardware/browser fingerprinting. */
export async function getOrCreateDeviceFingerprint(): Promise<string> {
  const cookieStore = await cookies();
  const existing = cookieStore.get(DEVICE_FINGERPRINT_COOKIE)?.value;
  if (existing) return existing;

  const fingerprint = randomUUID();
  cookieStore.set(DEVICE_FINGERPRINT_COOKIE, fingerprint, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: DEVICE_COOKIE_MAX_AGE,
  });
  return fingerprint;
}

function labelFromUserAgent(userAgent: string | null): string {
  if (!userAgent) return "Unknown device";
  const browser = /Edg\//.test(userAgent) ? "Edge" : /Chrome\//.test(userAgent) ? "Chrome" : /Firefox\//.test(userAgent) ? "Firefox" : /Safari\//.test(userAgent) ? "Safari" : "Browser";
  const os = /Windows/.test(userAgent) ? "Windows" : /Mac OS/.test(userAgent) ? "macOS" : /Linux/.test(userAgent) ? "Linux" : /Android/.test(userAgent) ? "Android" : /iPhone|iPad/.test(userAgent) ? "iOS" : "Unknown OS";
  return `${browser} on ${os}`;
}

/** Upserts the ClientDevice row for this browser's fingerprint cookie, real UA-derived label, real last-seen timestamp. */
export async function upsertClientDevice(clientPortalUserId: string): Promise<{ id: string }> {
  const fingerprint = await getOrCreateDeviceFingerprint();
  const headerStore = await headers();
  const userAgent = headerStore.get("user-agent");

  return prisma.clientDevice.upsert({
    where: { clientPortalUserId_fingerprint: { clientPortalUserId, fingerprint } },
    create: { clientPortalUserId, fingerprint, userAgent, label: labelFromUserAgent(userAgent), lastSeenAt: new Date() },
    update: { lastSeenAt: new Date(), userAgent, label: labelFromUserAgent(userAgent) },
    select: { id: true },
  });
}

export async function getClientIpAddress(): Promise<string | null> {
  const headerStore = await headers();
  const forwardedFor = headerStore.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0]?.trim() || null;
  return headerStore.get("x-real-ip");
}
