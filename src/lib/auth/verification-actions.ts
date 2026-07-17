"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { getAppBaseUrl } from "@/lib/outreach/tracking";
import { checkRateLimitDegradable } from "@/lib/security/rate-limit-distributed";
import { issueUserToken } from "@/lib/auth/tokens";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

export async function sendVerificationEmail(userId: string, email: string): Promise<void> {
  const rawToken = await issueUserToken(userId, "EMAIL_VERIFICATION");
  const verifyUrl = `${getAppBaseUrl()}/verify-email?token=${encodeURIComponent(rawToken)}`;

  await sendEmail({
    to: email,
    subject: "Verify your email — KVL GrowthOS",
    text: `Please verify your email address to finish securing your account:\n\n${verifyUrl}\n\nThis link is valid for 24 hours.`,
    html: `<p>Please verify your email address to finish securing your account.</p><p><a href="${verifyUrl}">Verify my email</a></p><p>This link is valid for 24 hours.</p>`,
  });
}

export async function resendVerificationEmail(): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const rate = await checkRateLimitDegradable(`resend-verification:${userId}`, { limit: 3, windowMs: 15 * 60_000 });
  if (!rate.allowed) {
    return { ok: false, error: "Too many requests. Please try again in a few minutes." };
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, emailVerified: true } });
  if (!user?.email) return { ok: false, error: "No email address on file." };
  if (user.emailVerified) return { ok: true };

  await sendVerificationEmail(userId, user.email);
  return { ok: true };
}
