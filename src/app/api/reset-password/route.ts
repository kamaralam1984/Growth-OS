import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { resetPasswordSchema } from "@/lib/validations/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { consumeUserToken } from "@/lib/auth/tokens";
import { logAudit } from "@/lib/audit";
import { hashPassword } from "@/lib/auth/password";

function clientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0]?.trim() || "unknown";
  return request.headers.get("x-real-ip") ?? "unknown";
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
  await prisma.user.update({
    where: { id: result.userId },
    // Clear any active lockout too — a successful reset is proof of
    // ownership, so there's no reason to keep the account locked.
    data: { password: hashed, failedLoginAttempts: 0, lockedUntil: null },
  });

  await logAudit({ userId: result.userId, action: "PASSWORD_RESET", metadata: { via: "forgot-password" } });

  return NextResponse.json({ ok: true });
}
