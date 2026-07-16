import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { forgotPasswordSchema } from "@/lib/validations/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { issueUserToken } from "@/lib/auth/tokens";
import { sendEmail } from "@/lib/email";
import { getAppBaseUrl } from "@/lib/outreach/tracking";
import { clientIpFromHeaders } from "@/lib/security/client-ip";

function clientIp(request: Request): string {
  return clientIpFromHeaders(request.headers);
}

// Always returns { ok: true } regardless of whether the email matches a real
// account — a differing response here would let an attacker enumerate
// registered emails. The real work (issuing a token + sending an email) only
// happens when a match is found.
export async function POST(request: Request) {
  const rate = checkRateLimit(`forgot-password:${clientIp(request)}`, { limit: 5, windowMs: 15 * 60_000 });
  if (!rate.allowed) {
    return NextResponse.json({ ok: true });
  }

  const body = await request.json().catch(() => null);
  const parsed = forgotPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: true });
  }

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email }, select: { id: true, email: true } });
  if (user?.email) {
    const rawToken = await issueUserToken(user.id, "PASSWORD_RESET");
    const resetUrl = `${getAppBaseUrl()}/reset-password?token=${encodeURIComponent(rawToken)}`;

    await sendEmail({
      to: user.email,
      subject: "Reset your KVL GrowthOS password",
      text: `We received a request to reset your password. This link is valid for 30 minutes:\n\n${resetUrl}\n\nIf you didn't request this, you can safely ignore this email.`,
      html: `<p>We received a request to reset your password. This link is valid for 30 minutes.</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>If you didn't request this, you can safely ignore this email.</p>`,
    });
  }

  return NextResponse.json({ ok: true });
}
