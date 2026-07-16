"use server";

import { z } from "zod";
import { headers } from "next/headers";

import { auth } from "@/auth";
import { recordDeviceSession } from "@/lib/device-session";

const fingerprintSchema = z.string().trim().regex(/^[0-9a-f]{64}$/, "Invalid fingerprint");

/**
 * Receives the real client-computed device fingerprint (see
 * src/lib/device-fingerprint.ts) and attaches it to this user's current
 * DeviceSession row. Called once per browser session by
 * DeviceFingerprintReporter (src/app/dashboard/_components/device-fingerprint-reporter.tsx),
 * mounted in the dashboard shell. Best-effort and silent: a signed-in user
 * with JS disabled, or any failure here, simply keeps the existing
 * userId+userAgent-only DeviceSession row — never blocks anything.
 */
export async function submitDeviceFingerprint(fingerprintHash: string): Promise<void> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return;

  const parsed = fingerprintSchema.safeParse(fingerprintHash);
  if (!parsed.success) return;

  try {
    const h = await headers();
    await recordDeviceSession(userId, { headers: h }, parsed.data);
  } catch (error) {
    console.error("[device-fingerprint-actions] submitDeviceFingerprint failed:", error);
  }
}
