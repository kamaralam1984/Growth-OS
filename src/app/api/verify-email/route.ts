import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { verifyEmailSchema } from "@/lib/validations/auth";
import { consumeUserToken } from "@/lib/auth/tokens";
import { logAudit } from "@/lib/audit";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = verifyEmailSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Missing verification token." },
      { status: 400 },
    );
  }

  const result = await consumeUserToken(parsed.data.token, "EMAIL_VERIFICATION");
  if (!result.ok || !result.userId) {
    return NextResponse.json({ error: result.error ?? "This link is invalid or has expired." }, { status: 400 });
  }

  await prisma.user.update({ where: { id: result.userId }, data: { emailVerified: new Date() } });
  await logAudit({ userId: result.userId, action: "EMAIL_VERIFIED" });

  return NextResponse.json({ ok: true });
}
