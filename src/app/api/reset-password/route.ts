import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { resetPasswordSchema } from "@/lib/validations/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { consumeUserToken } from "@/lib/auth/tokens";
import { logAudit } from "@/lib/audit";
import { logSecurityEvent } from "@/lib/security/security-events";
import { hashPassword } from "@/lib/auth/password";
import { clientIpFromHeaders } from "@/lib/security/client-ip";

function clientIp(request: Request): string {
  return clientIpFromHeaders(request.headers);
}

export async function POST(request: Request) {
  const rate = checkRateLimit(`reset-password:${clientIp(request)}`, { limit: 10, windowMs: 15 * 60_000 });
  if (!rate.allowed) {
    return NextResponse.json({ error: "Too many attempts. Please try again in a few minutes." }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const parsed = resetPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Please check your details and try again." },
      { status: 400 },
    );
  }

  const result = await consumeUserToken(parsed.data.token, "PASSWORD_RESET");
  if (!result.ok || !result.userId) {
    return NextResponse.json({ error: result.error ?? "This link is invalid or has expired." }, { status: 400 });
  }

  const hashed = await hashPassword(parsed.data.password);
  await prisma.$transaction([
    prisma.user.update({
      where: { id: result.userId },
      // Clear any active lockout too — a successful reset is proof of
      // ownership, so there's no reason to keep the account locked. Also
      // bump sessionInvalidatedAt: a password reset (e.g. after a phishing
      // incident) must terminate every already-issued JWT, not just stop
      // new sign-ins with the old password — see src/auth.ts's jwt()
      // callback, which is what actually enforces this for stateless
      // sessions. Also mirrors signOutAllDevices (src/app/profile/actions.ts).
      data: { password: hashed, failedLoginAttempts: 0, lockedUntil: null, sessionInvalidatedAt: new Date() },
    }),
    prisma.deviceSession.deleteMany({ where: { userId: result.userId } }),
    prisma.session.deleteMany({ where: { userId: result.userId } }),
  ]);

  await logAudit({ userId: result.userId, action: "PASSWORD_RESET", metadata: { via: "forgot-password" } });
  void logSecurityEvent({
    userId: result.userId,
    type: "PASSWORD_CHANGED",
    severity: "INFO",
    detail: "reset via forgot-password link; all other sessions revoked",
    ipAddress: clientIp(request),
    userAgent: request.headers.get("user-agent"),
  });

  return NextResponse.json({ ok: true });
}
